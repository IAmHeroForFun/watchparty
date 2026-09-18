import React, { useEffect, useRef } from "react";
import { createRoom } from "../TopBar/TopBar";
import { Loader, Text } from "@mantine/core";

export const Create = () => {
  const hasCreated = useRef(false);

  useEffect(() => {
    if (!hasCreated.current) {
      hasCreated.current = true;
      createRoom(false);
    }
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        width: "100vw",
        height: "100vh",
        backgroundColor: "#08080a",
        gap: "16px",
      }}
    >
      <Loader color="red" size="lg" />
      <Text size="md" fw={500} c="dimmed">
        Generating private stream room...
      </Text>
    </div>
  );
};
