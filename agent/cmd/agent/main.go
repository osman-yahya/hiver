package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	dockerclient "github.com/docker/docker/client"
	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/load"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
)

// ─── Config ──────────────────────────────────────────────────────────────────

type Config struct {
	MotherURL    string
	ServerLabel  string
	AgentToken   string
	PollInterval time.Duration
	LogKeywords  []string
	AgentPort    string
}

func loadConfig() Config {
	interval := 10 * time.Second
	if v := os.Getenv("POLL_INTERVAL_SECONDS"); v != "" {
		var secs int
		fmt.Sscan(v, &secs)
		if secs > 0 {
			interval = time.Duration(secs) * time.Second
		}
	}

	keywords := []string{"error", "panic", "exception", "fatal", "critical", "killed", "oom"}
	if v := os.Getenv("LOG_KEYWORDS"); v != "" {
		keywords = strings.Split(v, ",")
	}

	port := os.Getenv("AGENT_PORT")
	if port == "" {
		port = "8080"
	}

	serverLabel := os.Getenv("SERVER_LABEL")
	if serverLabel == "" {
		log.Fatalf("[hiver-agent] required env var SERVER_LABEL is not set")
	}

	return Config{
		MotherURL:    os.Getenv("MOTHER_URL"),
		ServerLabel:  serverLabel,
		AgentToken:   os.Getenv("AGENT_TOKEN"), // populated after registration or from env
		PollInterval: interval,
		LogKeywords:  keywords,
		AgentPort:    port,
	}
}

// ─── Payload Types ────────────────────────────────────────────────────────────

type RegistrationRequest struct {
	Label string `json:"label"`
}

type RegistrationResponse struct {
	AgentID string `json:"agent_id"`
	Token   string `json:"token"`
}

type ContainerInfo struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Image        string  `json:"image"`
	Status       string  `json:"status"`
	CPUPercent   float64 `json:"cpu_percent"`
	MemUsageMB   float64 `json:"mem_usage_mb"`
	MemLimitMB   float64 `json:"mem_limit_mb"`
	RestartCount int     `json:"restart_count"`
}

type ErrorLog struct {
	ContainerID   string `json:"container_id"`
	ContainerName string `json:"container_name"`
	Line          string `json:"line"`
	Timestamp     string `json:"timestamp"`
}

type MetricsPayload struct {
	AgentID    string          `json:"agent_id"`
	Label      string          `json:"label"`
	Timestamp  string          `json:"timestamp"`
	CPU        float64         `json:"cpu_percent"`
	MemTotal   uint64          `json:"mem_total_mb"`
	MemUsed    uint64          `json:"mem_used_mb"`
	MemFree    uint64          `json:"mem_free_mb"`
	DiskTotal  uint64          `json:"disk_total_gb"`
	DiskUsed   uint64          `json:"disk_used_gb"`
	DiskPct    float64         `json:"disk_percent"`
	NetByteIn  uint64          `json:"net_bytes_in"`
	NetByteOut uint64          `json:"net_bytes_out"`
	Load1      float64         `json:"load_1"`
	Load5      float64         `json:"load_5"`
	Load15     float64         `json:"load_15"`
	UptimeSecs uint64          `json:"uptime_secs"`
	TemperatureC float64       `json:"temperature_c"`
	Containers []ContainerInfo `json:"containers"`
	ErrorLogs  []ErrorLog      `json:"error_logs"`
}

// ─── Agent ────────────────────────────────────────────────────────────────────

type Agent struct {
	cfg          Config
	agentID      string
	dockerClient *dockerclient.Client
	httpClient   *http.Client
	// track container log read positions (container_id -> last read time)
	logCursors map[string]time.Time
}

func newAgent(cfg Config) *Agent {
	dc, err := dockerclient.NewClientWithOpts(dockerclient.FromEnv, dockerclient.WithAPIVersionNegotiation())
	if err != nil {
		log.Fatalf("[hiver-agent] failed to create Docker client: %v", err)
	}
	return &Agent{
		cfg:          cfg,
		dockerClient: dc,
		httpClient:   &http.Client{Timeout: 10 * time.Second},
		logCursors:   make(map[string]time.Time),
	}
}

func (a *Agent) register() {
	body, _ := json.Marshal(RegistrationRequest{Label: a.cfg.ServerLabel})
	resp, err := a.httpClient.Post(a.cfg.MotherURL+"/api/agents/register", "application/json", bytes.NewReader(body))
	if err != nil {
		log.Fatalf("[hiver-agent] registration failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		data, _ := io.ReadAll(resp.Body)
		log.Fatalf("[hiver-agent] registration rejected (%d): %s", resp.StatusCode, data)
	}
	var reg RegistrationResponse
	json.NewDecoder(resp.Body).Decode(&reg)
	a.agentID = reg.AgentID
	a.cfg.AgentToken = reg.Token
	log.Printf("[hiver-agent] registered as %q (id=%s)", a.cfg.ServerLabel, a.agentID)
}

func (a *Agent) run() {
	interval := a.cfg.PollInterval
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for range ticker.C {
		payload, err := a.collect()
		if err != nil {
			log.Printf("[hiver-agent] collect error: %v", err)
			continue
		}
		newInterval, err := a.send(payload)
		if err != nil {
			log.Printf("[hiver-agent] send error: %v", err)
		} else if newInterval > 0 && newInterval != interval {
			log.Printf("[hiver-agent] updating poll interval to %s (was %s)", newInterval, interval)
			interval = newInterval
			ticker.Reset(interval)
		}
	}
}

// ─── Collection ───────────────────────────────────────────────────────────────

func (a *Agent) collect() (*MetricsPayload, error) {
	ctx := context.Background()

	// CPU
	cpuPcts, _ := cpu.Percent(500*time.Millisecond, false)
	cpuPct := 0.0
	if len(cpuPcts) > 0 {
		cpuPct = cpuPcts[0]
	}

	// Memory
	vm, _ := mem.VirtualMemory()

	// Disk (root mount)
	diskStat, _ := disk.Usage("/host/proc/../..")
	if diskStat == nil {
		diskStat, _ = disk.Usage("/")
	}

	// Network
	netIO, _ := net.IOCounters(false)
	var netIn, netOut uint64
	if len(netIO) > 0 {
		netIn = netIO[0].BytesRecv
		netOut = netIO[0].BytesSent
	}

	// Load
	loadStat, _ := load.Avg()

	// Uptime
	uptime, _ := host.Uptime()

	// Temperature (CPU)
	tempStat, _ := host.SensorsTemperatures()
	var maxTemp float64
	for _, t := range tempStat {
		if t.Temperature > maxTemp && !strings.Contains(strings.ToLower(t.SensorKey), "pch") { // Filter out non-cpu logic boards if possible or just take max
			maxTemp = t.Temperature
		}
	}

	// Containers
	containers, errLogs, _ := a.collectDocker(ctx)
	if containers == nil {
		containers = []ContainerInfo{}
	}
	if errLogs == nil {
		errLogs = []ErrorLog{}
	}

	return &MetricsPayload{
		AgentID:    a.agentID,
		Label:      a.cfg.ServerLabel,
		Timestamp:  time.Now().UTC().Format(time.RFC3339),
		CPU:        cpuPct,
		MemTotal:   vm.Total / 1024 / 1024,
		MemUsed:    vm.Used / 1024 / 1024,
		MemFree:    vm.Free / 1024 / 1024,
		DiskTotal:  diskStat.Total / 1024 / 1024 / 1024,
		DiskUsed:   diskStat.Used / 1024 / 1024 / 1024,
		DiskPct:    diskStat.UsedPercent,
		NetByteIn:  netIn,
		NetByteOut: netOut,
		Load1:      loadStat.Load1,
		Load5:      loadStat.Load5,
		Load15:     loadStat.Load15,
		UptimeSecs: uptime,
		TemperatureC: maxTemp,
		Containers: containers,
		ErrorLogs:  errLogs,
	}, nil
}

func (a *Agent) collectDocker(ctx context.Context) ([]ContainerInfo, []ErrorLog, error) {
	list, err := a.dockerClient.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		return nil, nil, err
	}

	var mu sync.Mutex
	containers := []ContainerInfo{}
	errLogs := []ErrorLog{}

	var wg sync.WaitGroup
	for _, c := range list {
		wg.Add(1)
		go func(c types.Container) {
			defer wg.Done()

			name := strings.TrimPrefix(c.Names[0], "/")

			// Stats
			statsResp, err := a.dockerClient.ContainerStatsOneShot(ctx, c.ID)
			cpuPct := 0.0
			memUsage := 0.0
			memLimit := 0.0
			if err == nil {
				var statsJSON types.StatsJSON
				json.NewDecoder(statsResp.Body).Decode(&statsJSON)
				statsResp.Body.Close()
				cpuDelta := float64(statsJSON.CPUStats.CPUUsage.TotalUsage - statsJSON.PreCPUStats.CPUUsage.TotalUsage)
				sysDelta := float64(statsJSON.CPUStats.SystemUsage - statsJSON.PreCPUStats.SystemUsage)
				numCPUs := float64(statsJSON.CPUStats.OnlineCPUs)
				if sysDelta > 0 && numCPUs > 0 {
					cpuPct = (cpuDelta / sysDelta) * numCPUs * 100.0
				}
				memUsage = float64(statsJSON.MemoryStats.Usage) / 1024 / 1024
				memLimit = float64(statsJSON.MemoryStats.Limit) / 1024 / 1024
			}

			// Inspect for restart count
			restartCount := 0
			inspect, err := a.dockerClient.ContainerInspect(ctx, c.ID)
			if err == nil {
				restartCount = inspect.RestartCount
			}

			mu.Lock()
			containers = append(containers, ContainerInfo{
				ID:           c.ID[:12],
				Name:         name,
				Image:        c.Image,
				Status:       c.Status,
				CPUPercent:   cpuPct,
				MemUsageMB:   memUsage,
				MemLimitMB:   memLimit,
				RestartCount: restartCount,
			})
			mu.Unlock()

			// Error log tailing
			mu.Lock()
			since, ok := a.logCursors[c.ID]
			if !ok {
				since = time.Now().Add(-30 * time.Second)
			}
			mu.Unlock()

			logs, err := a.dockerClient.ContainerLogs(ctx, c.ID, container.LogsOptions{
				ShowStdout: true,
				ShowStderr: true,
				Since:      since.Format(time.RFC3339),
				Timestamps: true,
			})
			if err == nil {
				buf := new(bytes.Buffer)
				io.Copy(buf, logs)
				logs.Close()

				var newErrLogs []ErrorLog
				for _, line := range strings.Split(buf.String(), "\n") {
					if a.isErrorLine(line) {
						if len(line) >= 8 {
							newErrLogs = append(newErrLogs, ErrorLog{
								ContainerID:   c.ID[:12],
								ContainerName: name,
								Line:          strings.TrimSpace(line[8:]), // strip docker log header
								Timestamp:     time.Now().UTC().Format(time.RFC3339),
							})
						}
					}
				}

				mu.Lock()
				a.logCursors[c.ID] = time.Now()
				if len(newErrLogs) > 0 {
					errLogs = append(errLogs, newErrLogs...)
				}
				mu.Unlock()
			}
		}(c)
	}

	wg.Wait()
	return containers, errLogs, nil
}

func (a *Agent) isErrorLine(line string) bool {
	lower := strings.ToLower(line)
	for _, kw := range a.cfg.LogKeywords {
		if strings.Contains(lower, strings.TrimSpace(strings.ToLower(kw))) {
			return true
		}
	}
	return false
}

// ─── Send ─────────────────────────────────────────────────────────────────────

type MetricsResponse struct {
	Ok                  bool `json:"ok"`
	PollIntervalSeconds int  `json:"poll_interval_seconds"`
}

func (a *Agent) send(payload *MetricsPayload) (time.Duration, error) {
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", a.cfg.MotherURL+"/api/metrics", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+a.cfg.AgentToken)
	resp, err := a.httpClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return 0, fmt.Errorf("mother returned %d: %s", resp.StatusCode, data)
	}
	
	var r MetricsResponse
	json.Unmarshal(data, &r)
	
	log.Printf("[hiver-agent] metrics sent (containers=%d, errlogs=%d)", len(payload.Containers), len(payload.ErrorLogs))
	
	if r.PollIntervalSeconds > 0 {
		return time.Duration(r.PollIntervalSeconds) * time.Second, nil
	}
	return 0, nil
}

// ─── Main ─────────────────────────────────────────────────────────────────────

func (a *Agent) serveMetrics(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	auth := r.Header.Get("Authorization")
	if auth != "Bearer "+a.cfg.AgentToken {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	payload, err := a.collect()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(payload)
}

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("[hiver-agent] starting…")

	cfg := loadConfig()
	agent := newAgent(cfg)

	if cfg.MotherURL != "" {
		// ── PUSH MODE ────────────────────────────────────────────────
		// Register, then continuously push metrics to Mother on a ticker.
		// We do NOT start the HTTP listener in push mode.
		log.Printf("[hiver-agent] push mode — pushing to %s", cfg.MotherURL)
		agent.register()
		agent.run() // blocks forever
	} else {
		// ── PULL MODE ────────────────────────────────────────────────
		// Mother will reach out to us. Expose /metrics over HTTP.
		// AGENT_TOKEN must be provided via env for auth.
		if cfg.AgentToken == "" {
			log.Fatalf("[hiver-agent] AGENT_TOKEN must be set when MOTHER_URL is empty (pull mode)")
		}
		http.HandleFunc("/metrics", agent.serveMetrics)
		log.Printf("[hiver-agent] pull mode — listening for requests on :%s", cfg.AgentPort)
		if err := http.ListenAndServe(":"+cfg.AgentPort, nil); err != nil {
			log.Fatalf("[hiver-agent] http server error: %v", err)
		}
	}
}
