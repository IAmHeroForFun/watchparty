import React, { useCallback } from "react";
import { serverPath } from "../../utils/utils";
import { Button, Text } from "@mantine/core";
import { IconCirclePlusFilled } from "@tabler/icons-react";

export async function createRoom(openNewTab?: boolean) {
  const response = await fetch(serverPath + "/createRoom", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  const data = await response.json();
  const { name } = data;
  if (openNewTab) {
    window.open("/watch" + name);
  } else {
    window.location.assign("/watch" + name);
  }
}

export const NewRoomButton = (props: {
  size?: string;
  openNewTab?: boolean;
}) => {
  const onClick = useCallback(async () => {
    await createRoom(props.openNewTab);
  }, [props.openNewTab]);
  return (
    <Button
      size={props.size}
      color="red"
      onClick={onClick}
      leftSection={<IconCirclePlusFilled size={18} />}
    >
      New Room
    </Button>
  );
};

export const TopBar = (props: {
  hideNewRoom?: boolean;
  roomTitle?: string;
  roomDescription?: string;
  roomTitleColor?: string;
}) => {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        padding: "10px 16px",
        background: "#0d0e12",
        borderBottom: "1px solid rgba(255, 46, 76, 0.2)",
        rowGap: "8px",
      }}
    >
      <a href="/" style={{ display: "flex", textDecoration: "none" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <span
            style={{
              textTransform: "uppercase",
              fontWeight: 700,
              color: "#f8fafc",
              fontSize: "24px",
              letterSpacing: "1px",
            }}
          >
            Stream
          </span>
          <span
            style={{
              textTransform: "uppercase",
              fontWeight: 700,
              color: "#ff2e4c",
              fontSize: "24px",
              letterSpacing: "1px",
              marginLeft: "2px",
            }}
          >
            Party
          </span>
        </div>
      </a>

      {props.roomTitle && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            marginLeft: "20px",
          }}
        >
          <div
            style={{
              fontSize: "18px",
              color: props.roomTitleColor || "#f8fafc",
              fontWeight: 600,
            }}
          >
            {props.roomTitle}
          </div>
          {props.roomDescription && (
            <Text size="xs" c="dimmed">
              {props.roomDescription}
            </Text>
          )}
        </div>
      )}

      <div
        style={{
          display: "flex",
          marginLeft: "auto",
          alignItems: "center",
          gap: "8px",
        }}
      >
        {!props.hideNewRoom && <NewRoomButton openNewTab />}
      </div>
    </header>
  );
};
