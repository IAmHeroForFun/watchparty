import React from "react";

export const DEFAULT_STATE = {
  user: undefined as any,
  isSubscriber: true,
  streamPath: undefined as string | undefined,
  convertPath: undefined as string | undefined,
  beta: false,
};

export const MetadataContext = React.createContext(DEFAULT_STATE);
