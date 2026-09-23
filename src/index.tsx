import "@mantine/core/styles.css";
import "./index.css";

import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route } from "react-router-dom";

import { App } from "./components/App/App";
import { Home } from "./components/Home/Home";
import { TopBar } from "./components/TopBar/TopBar";
import { Footer } from "./components/Footer/Footer";
import { Create } from "./components/Create/Create";
import { AdminPanel } from "./components/Admin/AdminPanel";
import { DEFAULT_STATE, MetadataContext } from "./MetadataContext";
import { createTheme, MantineProvider } from "@mantine/core";

const theme = createTheme({
  fontFamily: "'Fira Code', monospace",
  fontFamilyMonospace: "'Fira Code', monospace",
  primaryColor: "red",
  colors: {
    dark: [
      "#f1f5f9",
      "#cbd5e1",
      "#94a3b8",
      "#64748b",
      "#334155",
      "#1e293b",
      "#14151b",
      "#0f1015",
      "#0a0a0d",
      "#060608",
    ],
    red: [
      "#ffe5e8",
      "#ffccd1",
      "#ffa3ab",
      "#ff7582",
      "#ff4d5e",
      "#ff2e4c", // Primary electric red
      "#e60026",
      "#c7001f",
      "#9e0019",
      "#7a0013",
    ],
  },
  defaultRadius: "xs",
});

// Redirect old-style hash URLs
if (window.location.hash && window.location.pathname === "/") {
  const hashRoomId = window.location.hash.substring(1);
  window.location.href = "/watch/" + hashRoomId;
}

class StreamParty extends React.Component {
  public state = {
    ...DEFAULT_STATE,
    isSubscriber: true,
  };

  render() {
    return (
      <MantineProvider theme={theme} forceColorScheme="dark">
        <MetadataContext.Provider value={this.state}>
          <BrowserRouter>
            <Route
              path="/"
              exact
              render={() => {
                return (
                  <React.Fragment>
                    <TopBar hideNewRoom />
                    <Home />
                    <Footer />
                  </React.Fragment>
                );
              }}
            />
            <Route
              path="/create"
              exact
              render={() => {
                return <Create />;
              }}
            />
            <Route
              path="/watch/:roomId"
              exact
              render={(props) => {
                return <App urlRoomId={props.match.params.roomId} />;
              }}
            />
            <Route
              path="/admin"
              exact
              render={() => {
                return <AdminPanel />;
              }}
            />
            <Route
              path="/admin/:roomId"
              exact
              render={(props) => {
                return (
                  <AdminPanel initialRoomId={props.match.params.roomId} />
                );
              }}
            />
            <Route
              path="/r/:vanity"
              exact
              render={(props) => {
                return <App vanity={props.match.params.vanity} />;
              }}
            />
          </BrowserRouter>
        </MetadataContext.Provider>
      </MantineProvider>
    );
  }
}

const container = document.getElementById("root");
const root = createRoot(container!);
root.render(<StreamParty />);
