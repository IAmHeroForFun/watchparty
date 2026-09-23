import React, { useState, useEffect, useRef } from "react";
import {
  Button,
  PasswordInput,
  TextInput,
  Text,
  Badge,
  ActionIcon,
  Card,
  Group,
  Stack,
  Alert,
} from "@mantine/core";
import {
  IconLock,
  IconScreenShare,
  IconScreenShareOff,
  IconCopy,
  IconCheck,
  IconBroadcast,
  IconUsers,
  IconKey,
  IconLogout,
  IconEye,
  IconCirclePlus,
} from "@tabler/icons-react";
import { serverPath } from "../../utils/utils";
import { App } from "../App/App";

interface AdminPanelProps {
  initialRoomId?: string;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ initialRoomId }) => {
  const [token, setToken] = useState<string>(
    localStorage.getItem("streamparty-admin-token") || "",
  );
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeRoomId, setActiveRoomId] = useState<string>(
    initialRoomId || "live-stream",
  );
  const [copied, setCopied] = useState(false);

  // Validate existing token on mount
  useEffect(() => {
    if (token) {
      fetch(`${serverPath}/api/admin/verify`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (!res.ok) {
            setToken("");
            localStorage.removeItem("streamparty-admin-token");
          }
        })
        .catch(() => {
          // If offline/error, keep token
        });
    }
  }, [token]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setAuthError("");

    try {
      const res = await fetch(`${serverPath}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setToken(data.token);
        localStorage.setItem("streamparty-admin-token", data.token);
      } else {
        setAuthError(data.error || "Invalid password");
      }
    } catch (err) {
      setAuthError("Could not reach authentication server");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    setToken("");
    localStorage.removeItem("streamparty-admin-token");
  };

  const viewerLink = `${window.location.origin}/watch/${activeRoomId}`;

  const copyViewerLink = () => {
    navigator.clipboard.writeText(viewerLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // If not authenticated, show modern dark admin login form
  if (!token) {
    return (
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: "#08080a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
          color: "#f1f5f9",
        }}
      >
        <Card
          padding="xl"
          radius="md"
          style={{
            maxWidth: "420px",
            width: "100%",
            backgroundColor: "#111217",
            border: "1px solid rgba(255, 46, 76, 0.3)",
            boxShadow: "0 12px 40px rgba(0, 0, 0, 0.8)",
          }}
        >
          <form onSubmit={handleLogin}>
            <Stack gap="md">
              <div style={{ textAlign: "center", marginBottom: "8px" }}>
                <div
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "50%",
                    backgroundColor: "rgba(255, 46, 76, 0.15)",
                    border: "1px solid rgba(255, 46, 76, 0.4)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 12px",
                  }}
                >
                  <IconLock size={28} color="#ff2e4c" />
                </div>
                <Text size="xl" fw={700} style={{ color: "#ffffff" }}>
                  Broadcaster Studio
                </Text>
                <Text size="xs" c="dimmed">
                  Enter admin credentials to start broadcasting
                </Text>
              </div>

              {authError && (
                <Alert color="red" variant="light" title="Authentication Failed">
                  {authError}
                </Alert>
              )}

              <PasswordInput
                label="Admin Password"
                placeholder="Enter password..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                leftSection={<IconKey size={16} />}
                required
                autoFocus
              />

              <Button
                type="submit"
                color="red"
                fullWidth
                loading={isLoading}
                leftSection={<IconBroadcast size={18} />}
                style={{
                  boxShadow: "0 0 16px rgba(255, 46, 76, 0.3)",
                }}
              >
                Access Admin Studio
              </Button>

              <Text size="xs" c="dimmed" ta="center">
                Configure ADMIN_PASSWORD in your server environment
              </Text>
            </Stack>
          </form>
        </Card>
      </div>
    );
  }

  // Once authenticated: Render the Broadcaster Admin Studio
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        backgroundColor: "#08080a",
      }}
    >
      {/* Top Admin Studio Navigation Bar */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 16px",
          backgroundColor: "#0f1015",
          borderBottom: "1px solid rgba(255, 46, 76, 0.3)",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <Group gap="xs">
          <Badge
            color="red"
            variant="filled"
            size="lg"
            leftSection={<IconBroadcast size={14} />}
          >
            ADMIN STUDIO
          </Badge>
          <TextInput
            size="xs"
            value={activeRoomId}
            onChange={(e) => setActiveRoomId(e.target.value.trim().toLowerCase())}
            placeholder="Room ID..."
            style={{ width: "160px" }}
          />
        </Group>

        <Group gap="xs">
          {/* Share Viewer Link Pill */}
          <Button
            size="xs"
            variant="light"
            color="red"
            leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
            onClick={copyViewerLink}
          >
            {copied ? "Viewer Link Copied!" : "Copy Viewer Link"}
          </Button>

          <Button
            size="xs"
            variant="subtle"
            color="gray"
            leftSection={<IconEye size={14} />}
            component="a"
            href={viewerLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            Preview Viewer
          </Button>

          <ActionIcon
            size="sm"
            color="gray"
            variant="subtle"
            title="Logout of Admin Studio"
            onClick={handleLogout}
          >
            <IconLogout size={16} />
          </ActionIcon>
        </Group>
      </header>

      {/* Main Studio View - Mounts App in Admin Mode */}
      <div style={{ flexGrow: 1, position: "relative", overflow: "hidden" }}>
        <App key={activeRoomId} urlRoomId={activeRoomId} isAdmin={true} />
      </div>
    </div>
  );
};
