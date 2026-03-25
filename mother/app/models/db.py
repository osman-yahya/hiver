from sqlalchemy import Column, String, Float, BigInteger, Integer, Boolean, Text, DateTime, ForeignKey, Enum
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime
import enum
import uuid

Base = declarative_base()


def new_uuid():
    return str(uuid.uuid4())


class UserRole(str, enum.Enum):
    admin = "admin"
    operator = "operator"
    kiosk = "kiosk"


class ServerStatus(str, enum.Enum):
    online = "online"
    degraded = "degraded"
    offline = "offline"
    unknown = "unknown"


class ConnectionType(str, enum.Enum):
    push = "push"
    pull = "pull"


class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=new_uuid)
    username = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.operator)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)


class Server(Base):
    __tablename__ = "servers"
    id = Column(String, primary_key=True, default=new_uuid)
    label = Column(String, nullable=False, index=True)
    token = Column(String, unique=True, nullable=False)
    status = Column(Enum(ServerStatus), default=ServerStatus.unknown)
    group_name = Column(String, nullable=True, index=True)
    tags = Column(Text, default="")          # comma-separated
    connection_type = Column(Enum(ConnectionType), default=ConnectionType.push)
    agent_url = Column(String, nullable=True) # e.g. http://10.0.0.5:8080
    last_seen = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    missed_heartbeats = Column(Integer, default=0)

    metrics = relationship("MetricSnapshot", back_populates="server", cascade="all, delete-orphan")
    containers = relationship("ContainerRecord", back_populates="server", cascade="all, delete-orphan")
    error_logs = relationship("ErrorLog", back_populates="server", cascade="all, delete-orphan")


class MetricSnapshot(Base):
    __tablename__ = "metric_snapshots"
    id = Column(Integer, primary_key=True, autoincrement=True)
    server_id = Column(String, ForeignKey("servers.id"), nullable=False, index=True)
    recorded_at = Column(DateTime, default=datetime.utcnow, index=True)
    cpu_percent = Column(Float)
    mem_total_mb = Column(BigInteger)
    mem_used_mb = Column(BigInteger)
    disk_total_gb = Column(BigInteger)
    disk_used_gb = Column(BigInteger)
    disk_percent = Column(Float)
    net_bytes_in = Column(BigInteger)
    net_bytes_out = Column(BigInteger)
    load_1 = Column(Float)
    load_5 = Column(Float)
    load_15 = Column(Float)
    uptime_secs = Column(BigInteger)

    server = relationship("Server", back_populates="metrics")


class ContainerRecord(Base):
    __tablename__ = "containers"
    id = Column(Integer, primary_key=True, autoincrement=True)
    server_id = Column(String, ForeignKey("servers.id"), nullable=False, index=True)
    container_id = Column(String)
    name = Column(String)
    image = Column(String)
    status = Column(String)
    cpu_percent = Column(Float)
    mem_usage_mb = Column(Float)
    mem_limit_mb = Column(Float)
    restart_count = Column(Integer)
    updated_at = Column(DateTime, default=datetime.utcnow)

    server = relationship("Server", back_populates="containers")


class ErrorLog(Base):
    __tablename__ = "error_logs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    server_id = Column(String, ForeignKey("servers.id"), nullable=False, index=True)
    container_id = Column(String)
    container_name = Column(String)
    raw_log = Column(Text)
    ai_explanation = Column(Text, nullable=True)
    ai_processed = Column(Boolean, default=False)
    severity = Column(String, default="error")
    recorded_at = Column(DateTime, default=datetime.utcnow, index=True)

    server = relationship("Server", back_populates="error_logs")


class AlertRule(Base):
    __tablename__ = "alert_rules"
    id = Column(String, primary_key=True, default=new_uuid)
    name = Column(String, nullable=False)
    server_id = Column(String, ForeignKey("servers.id"), nullable=True)  # None = all servers
    group_name = Column(String, nullable=True)
    rule_type = Column(String)   # cpu | ram | disk | container_exit | heartbeat
    threshold = Column(Float, nullable=True)
    duration_minutes = Column(Integer, default=5)
    notify_webhook = Column(String, nullable=True)
    notify_email = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    cooldown_minutes = Column(Integer, default=30)
    created_at = Column(DateTime, default=datetime.utcnow)


class Alert(Base):
    __tablename__ = "alerts"
    id = Column(String, primary_key=True, default=new_uuid)
    rule_id = Column(String, ForeignKey("alert_rules.id"), nullable=True)
    server_id = Column(String, ForeignKey("servers.id"), nullable=True)
    title = Column(String)
    message = Column(Text)
    severity = Column(String, default="warning")   # info | warning | critical
    is_acknowledged = Column(Boolean, default=False)
    fired_at = Column(DateTime, default=datetime.utcnow, index=True)
    resolved_at = Column(DateTime, nullable=True)


class GlobalSettings(Base):
    __tablename__ = "global_settings"
    key = Column(String, primary_key=True)
    value = Column(Text)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, nullable=True)
    username = Column(String, nullable=True)
    action = Column(String)
    detail = Column(Text, nullable=True)
    ip_address = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
