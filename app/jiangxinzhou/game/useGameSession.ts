"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { createGameGateway } from "./gateway.ts";
import { gameReducer, initialGameState } from "./gameState.ts";
import { loadProfile, loadStoredGameState, saveProfile, saveStoredGameState } from "./storage.ts";
import type { GameMode, PlayerCommand, PlayerCommandInput } from "./types.ts";

export function useGameSession({ mode, roomId }: { mode: GameMode; roomId?: string }) {
  const [state, dispatch] = useReducer(gameReducer, mode, initialGameState);
  const gateway = useMemo(() => createGameGateway(mode, roomId), [mode, roomId]);
  const sequence = useRef(0);
  const fallbackRef = useRef(false);

  useEffect(() => {
    const stored = loadStoredGameState();
    dispatch({ type: "hydrate", profile: loadProfile(), collection: stored.collection, xp: stored.xp, badges: stored.badges });
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    dispatch({ type: "joining", mode });
    const connect = async () => {
      try {
        const profile = await gateway.bootstrap();
        if (cancelled) return;
        dispatch({ type: "profile", profile });
        const room = await gateway.joinRoom(roomId);
        if (cancelled) return;
        dispatch({ type: "joined", room });
        unsubscribe = gateway.subscribe(
          (snapshot) => dispatch({ type: "snapshot", snapshot }),
          (players) => dispatch({ type: "presence", players }),
          (event) => dispatch({ type: "event", event }),
        );
      } catch (error) {
        if (cancelled) return;
        dispatch({ type: "status", status: "offline", error: error instanceof Error ? error.message : "Game service unavailable" });
      }
    };
    void connect();
    return () => {
      cancelled = true;
      unsubscribe?.();
      void gateway.leaveRoom();
      gateway.dispose?.();
    };
  }, [gateway, mode, roomId]);

  useEffect(() => {
    if (!state.hydrated || !state.profile) return;
    saveProfile(state.profile);
    saveStoredGameState({ version: 2, collection: state.collection, xp: state.xp, badges: state.badges, lastActiveAt: Date.now() });
  }, [state.badges, state.collection, state.hydrated, state.profile, state.xp]);

  const sendCommand = useCallback(async (command: PlayerCommandInput) => {
    const seq = ++sequence.current;
    const fullCommand = { ...command, seq } as PlayerCommand;
    dispatch({ type: "command-sent", seq });
    const ack = await gateway.sendCommand(fullCommand);
    dispatch({ type: "command-ack", ack, source: mode === "room" ? "room" : "solo" });
    if (ack.snapshot) dispatch({ type: "snapshot", snapshot: ack.snapshot });
    return ack;
  }, [gateway, mode]);

  const moveTo = useCallback((targetId: string, routeId?: string) => sendCommand({ kind: "move-to", targetId, routeId }), [sendCommand]);
  const observeLandmark = useCallback((landmarkId: number) => sendCommand({ kind: "observe", landmarkId }), [sendCommand]);
  const cancelMove = useCallback(() => sendCommand({ kind: "cancel-move" }), [sendCommand]);
  const ping = useCallback(() => sendCommand({ kind: "ping" }), [sendCommand]);
  const updateIdentity = useCallback(async (displayName: string, color: string) => {
    const profile = await gateway.updateProfile?.({ displayName, color });
    if (profile) dispatch({ type: "profile", profile });
  }, [gateway]);
  const clearCompletedLandmark = useCallback(() => dispatch({ type: "clear-completed" }), []);

  return {
    ...state,
    isLocalGateway: gateway.kind === "local",
    isSupabaseGateway: gateway.kind === "supabase",
    moveTo,
    observeLandmark,
    cancelMove,
    ping,
    updateIdentity,
    clearCompletedLandmark,
    reconnect: ping,
    fallbackRef,
  };
}
