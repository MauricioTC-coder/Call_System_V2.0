/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  Settings, Activity, FileText, Volume2, VolumeX, Plus, Trash2, 
  ToggleLeft, ToggleRight, HardHat, ShieldCheck, AlertOctagon, 
  Loader2, Play, CheckCircle2, Trash, Download, Database, BookOpen, 
  Clock, ArrowUpRight, Ban, RefreshCw, BarChart2, Check, ExternalLink,
  ChevronRight, ArrowLeft
} from "lucide-react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";

import AppBar from "./components/AppBar";
import InstallPrompt from "./components/InstallPrompt";
import { Profile, Call, Location, CallType, AuditLog, LiveStats, CallState } from "./types";
import { TEAM_MEMBERS, TM_SHARED_PASSWORD } from "./lib/constants";
import { 
  unlockAudio, playAndon, startAndonLoop, stopAndonLoop, isAndonLooping, setMuteState, getMuteState 
} from "./lib/andon-sound";

// Active App Path-Based Router States
type RoutePath = 
  | "/" 
  | "/tm/login" 
  | "/tm/chamada" 
  | "/tl/login" 
  | "/tl/setup" 
  | "/tl/chamadas" 
  | "/tl/dashboard" 
  | "/tl/config"
  | "/tv";

export default function App() {
  // Navigation & Sessions States
  const [currentPath, setCurrentPath] = useState<RoutePath>("/");
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [currentRole, setCurrentRole] = useState<"team_leader" | "team_member" | "admin" | null>(null);

  // Database Resources States
  const [calls, setCalls] = useState<Call[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [callTypes, setCallTypes] = useState<CallType[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLog[]>([]);
  const [tlExists, setTlExists] = useState<boolean>(false);
  const [operators, setOperators] = useState<(Profile & { role: string })[]>([
    { id: "tm-1", nome: "Maurício Silva (TM1)", email: "tm1@toyota-ovar.local", nfc_uid: "04:12:45:78", ativo: true, criado_em: new Date().toISOString(), role: "team_member" },
    { id: "tm-2", nome: "Rita Correia (TM2)", email: "tm2@toyota-ovar.local", nfc_uid: "54:ea:71:02", ativo: true, criado_em: new Date().toISOString(), role: "team_member" },
    { id: "tm-3", nome: "Eduardo Cruz (TM3)", email: "tm3@toyota-ovar.local", nfc_uid: "12:bc:90:ee", ativo: true, criado_em: new Date().toISOString(), role: "team_member" },
    { id: "tl-toyota-admin", nome: "Team Leader Toyota", email: "super.lider@toyota-ovar.local", nfc_uid: "74:EA:91:10", ativo: true, criado_em: new Date().toISOString(), role: "team_leader" }
  ]);

  // NFC / operators administrative states
  const [newOpNome, setNewOpNome] = useState("");
  const [newOpEmail, setNewOpEmail] = useState("");
  const [newOpRole, setNewOpRole] = useState<"team_member" | "team_leader">("team_member");
  const [newOpNfcUid, setNewOpNfcUid] = useState("");
  const [opScanningId, setOpScanningId] = useState<string | null>(null);
  const [isNfcScannerActive, setIsNfcScannerActive] = useState(false);
  const [nfcScannerStatus, setNfcScannerStatus] = useState("");

  // Interactive UI configurations
  const [audioMuted, setAudioMuted] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<"connected" | "connecting" | "disconnected">("connecting");
  const [floatingToast, setFloatingToast] = useState<{ message: string; type: "info" | "success" | "warning"; id: string } | null>(null);

  // TM active actions properties
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [selectedCallType, setSelectedCallType] = useState<string>("");
  const [submittingCall, setSubmittingCall] = useState<boolean>(false);

  // TL Configuration forms
  const [newLocationName, setNewLocationName] = useState("");
  const [newCallTypeName, setNewCallTypeName] = useState("");
  const [loadingConfig, setLoadingConfig] = useState(false);
  
  // TL Setup form states
  const [setupNome, setSetupNome] = useState("");
  const [setupEmail, setSetupEmail] = useState("");
  const [setupSenha, setSetupSenha] = useState("");
  const [setupConfirm, setSetupConfirm] = useState("");
  const [setupError, setSetupError] = useState("");
  const [setupSuccess, setSetupSuccess] = useState(false);

  // TL Sign In Form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginSenha, setLoginSenha] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  // Active closure comment state
  const [closingCallId, setClosingCallId] = useState<string | null>(null);
  const [closingObservation, setClosingObservation] = useState("");

  // SSE EventSource reference and re-connection triggers
  const eventSourceRef = useRef<EventSource | null>(null);
  const [reconnectTrigger, setReconnectTrigger] = useState(0);

  // System general tick state (forces re-renders of active stopwatches every second)
  const [tick, setTick] = useState(0);

  // Create customized notification toasts
  const triggerToast = (message: string, type: "info" | "success" | "warning" = "info") => {
    setFloatingToast({ message, type, id: Math.random().toString() });
  };

  // Resolve active call corresponding to logged in operator
  const getActiveOperatorCall = (): Call | undefined => {
    if (!currentUser) return undefined;
    return calls.find(c => c.team_member_id === currentUser.id && (c.estado === "aberta" || c.estado === "em_atendimento"));
  };

  // -----------------------------------------------------------------
  // 1. DATA API SYNC SERVICES
  // -----------------------------------------------------------------
  const fetchAllData = async () => {
    setSyncStatus("connecting");

    const pCalls = fetch("/api/calls")
      .then(res => res.ok ? res.json() : [])
      .then(data => setCalls(data))
      .catch(err => console.error("Error fetching calls:", err));

    const pLocs = fetch("/api/locations")
      .then(res => res.ok ? res.json() : [])
      .then(data => setLocations(data))
      .catch(err => console.error("Error fetching locations:", err));

    const pTypes = fetch("/api/call_types")
      .then(res => res.ok ? res.json() : [])
      .then(data => setCallTypes(data))
      .catch(err => console.error("Error fetching call types:", err));

    const pCheck = fetch("/api/check-tl")
      .then(res => res.ok ? res.json() : { exists: false })
      .then(data => setTlExists(data.exists))
      .catch(err => console.error("Error checking TL:", err));

    const pAudit = fetch("/api/audit_log")
      .then(res => res.ok ? res.json() : [])
      .then(data => setAuditLog(data))
      .catch(err => console.error("Error fetching audit log:", err));

    const pOps = fetch("/api/operators")
      .then(res => res.ok ? res.json() : [])
      .then(data => setOperators(data))
      .catch(err => console.error("Error fetching operators:", err));

    try {
      await Promise.all([pCalls, pLocs, pTypes, pCheck, pAudit, pOps]);
      setSyncStatus("connected");
    } catch (err) {
      console.error("Connection synchronization failure:", err);
      setSyncStatus("disconnected");
    }
  };

  // Load essential values on boot
  useEffect(() => {
    fetchAllData();
  }, [reconnectTrigger]);

  // Handle active audio looping whenever active open calls are in the system
  useEffect(() => {
    const hasOpenAndonInLine = calls.some(c => c.estado === "aberta");
    const isTlActive = currentRole === "team_leader";
    const isTvActive = currentPath === "/tv";
    
    if (hasOpenAndonInLine && (isTlActive || isTvActive) && !audioMuted) {
      startAndonLoop();
    } else {
      stopAndonLoop();
    }

    return () => {
      stopAndonLoop();
    };
  }, [calls, currentRole, currentPath, audioMuted]);

  // Stopwatch ticking interval
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Set up Server-Sent Events (SSE) stream for instant dispatch and auditory alarms
  useEffect(() => {
    console.log("Initializing Realtime Andon SSE Channel...");
    const sse = new EventSource("/api/realtime");
    eventSourceRef.current = sse;

    sse.onopen = () => {
      console.log("Realtime Andon Stream Connected.");
      setSyncStatus("connected");
    };

    sse.onerror = () => {
      console.warn("Realtime Stream Disconnected. Fallback initiated.");
      setSyncStatus("disconnected");
      sse.close();
      // Retry connection after 5s
      setTimeout(() => {
        setReconnectTrigger(prev => prev + 1);
      }, 5000);
    };

    // Generic Message dispatcher simulation
    sse.onmessage = (event) => {
      try {
        const { event: evName, payload } = JSON.parse(event.data);
        console.log(`SSE Realtime Message received: ${evName}`, payload);

        if (evName === "connected") {
          return;
        }

        if (evName === "call_created") {
          setCalls(prev => [payload, ...prev.filter(c => c.id !== payload.id)]);
          triggerToast(`Nova Chamada Ativa: ${payload.id} - ${payload.location_nome}`, "warning");
          // Play a single sequence right away as visual reinforcement
          if ((currentRole === "team_leader" || currentPath === "/tv") && !audioMuted) {
            playAndon();
          }
        } else if (evName === "call_updated") {
          setCalls(prev => prev.map(c => c.id === payload.id ? payload : c));
          triggerToast(`Chamada ${payload.id} atualizada para: ${payload.estado.toUpperCase()}`, "info");
        } else if (evName === "locations_updated") {
          setLocations(payload);
        } else if (evName === "call_types_updated") {
          setCallTypes(payload);
        } else if (evName === "audit_logged") {
          setAuditLog(prev => [payload, ...prev]);
        } else if (evName === "system_reset" || evName === "system_bootstrapped") {
          fetchAllData();
          triggerToast("Sistema atualizado pelo administrador.", "info");
        }
      } catch (err) {
        console.error("Could not parse stream event:", err);
      }
    };

    return () => {
      sse.close();
      eventSourceRef.current = null;
    };
  }, [currentRole, audioMuted, currentPath]);

  // Auto fallback polling at wider intervals (5s) for background protection
  useEffect(() => {
    const backupInterval = setInterval(() => {
      if (syncStatus !== "connected") {
        fetchAllData();
      }
    }, 5000);
    return () => clearInterval(backupInterval);
  }, [syncStatus]);

  // Persist session locally to withstand browser refreshes beautifully
  useEffect(() => {
    const savedUser = localStorage.getItem("toyota_andon_user");
    const savedRole = localStorage.getItem("toyota_andon_role");
    
    if (savedUser && savedRole) {
      setCurrentUser(JSON.parse(savedUser));
      setCurrentRole(savedRole as any);
      
      // Auto routing based on roles
      if (savedRole === "team_member") {
        setCurrentPath("/tm/chamada");
      } else if (savedRole === "team_leader" || savedRole === "admin") {
        setCurrentPath("/tl/chamadas");
      }
    }
  }, []);

  const handleSignOut = () => {
    stopAndonLoop();
    localStorage.removeItem("toyota_andon_user");
    localStorage.removeItem("toyota_andon_role");
    setCurrentUser(null);
    setCurrentRole(null);
    setCurrentPath("/");
    triggerToast("Estação desconectada.", "info");
  };

  const handleAudioToggle = () => {
    unlockAudio(); // Trigger once on action to unlock AudioContext
    const nextMute = !audioMuted;
    setAudioMuted(nextMute);
    setMuteState(nextMute);
    triggerToast(nextMute ? "Alertas Sonoros Silenciados" : "Alertas Sonoros Ativados", nextMute ? "info" : "success");
  };

  // Clear floating toast notifications automatically after 4s
  useEffect(() => {
    if (floatingToast) {
      const t = setTimeout(() => setFloatingToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [floatingToast]);

  // -----------------------------------------------------------------
  // 2. TIMERS & STOPWATCH CALCULATIONS
  // -----------------------------------------------------------------
  const formatStopWatch = (isoString: string): string => {
    try {
      const diffMs = new Date().getTime() - new Date(isoString).getTime();
      const diffSecs = Math.max(0, Math.floor(diffMs / 1000));
      const hours = Math.floor(diffSecs / 3600);
      const mins = Math.floor((diffSecs % 3600) / 60);
      const secs = diffSecs % 60;

      return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    } catch (err) {
      return "00:00:00";
    }
  };

  const truncateDurationSecs = (fromISO: string, toISO: string | null): number => {
    if (!toISO) return 0;
    try {
      const diffMs = new Date(toISO).getTime() - new Date(fromISO).getTime();
      return Math.max(0, Math.floor(diffMs / 1000));
    } catch (err) {
      return 0;
    }
  };

  const formatSecsToDurationLabel = (totalSecs: number): string => {
    const mins = Math.floor(totalSecs / 60);
    const secs = Math.floor(totalSecs % 60);
    return `${mins}m ${secs}s`;
  };

  // -----------------------------------------------------------------
  // 3. STATISTICAL KPIs SUMMARIZERS
  // -----------------------------------------------------------------
  const getCalculatedStats = (): LiveStats => {
    const historical = calls;
    const stats: LiveStats = {
      total: historical.length,
      abertas: historical.filter(c => c.estado === "aberta").length,
      emAtendimento: historical.filter(c => c.estado === "em_atendimento").length,
      resolvidas: historical.filter(c => c.estado === "resolvida").length,
      canceladas: historical.filter(c => c.estado === "cancelada").length,
      tempoMedioAtendimento: 0,
      tempoMedioResolucao: 0
    };

    // Medium calculations
    const answered = historical.filter(c => c.atendida_em);
    if (answered.length > 0) {
      const sumAnswer = answered.reduce((acc, c) => acc + truncateDurationSecs(c.aberta_em, c.atendida_em), 0);
      stats.tempoMedioAtendimento = Math.floor(sumAnswer / answered.length);
    }

    const resolved = historical.filter(c => c.resolvida_em && c.atendida_em);
    if (resolved.length > 0) {
      const sumResolve = resolved.reduce((acc, c) => acc + truncateDurationSecs(c.atendida_em, c.resolvida_em), 0);
      stats.tempoMedioResolucao = Math.floor(sumResolve / resolved.length);
    }

    return stats;
  };

  const liveStats = getCalculatedStats();

  // -----------------------------------------------------------------
  // 4. ACTION CONTROLLERS
  // -----------------------------------------------------------------

  // BOOTSTRAP INICIAL
  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupError("");
    setSetupSuccess(false);

    if (!setupNome || !setupEmail || !setupSenha) {
      setSetupError("Preencha todos os campos obrigatórios.");
      return;
    }

    if (setupSenha.length < 5) {
      setSetupError("A senha deve conter no mínimo 5 caracteres.");
      return;
    }

    if (setupSenha !== setupConfirm) {
      setSetupError("As senhas inseridas não correspondem.");
      return;
    }

    try {
      setLoggingIn(true);
      const res = await fetch("/api/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: setupNome, email: setupEmail, password: setupSenha })
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || "Houve uma falha ao configurar.");
      }

      setSetupSuccess(true);
      triggerToast("Bootstrap completo! Team Leaders e TMs criados.", "success");

      // Auto login after setup completes
      localStorage.setItem("toyota_andon_user", JSON.stringify(body.user));
      localStorage.setItem("toyota_andon_role", "team_leader");
      setCurrentUser(body.user);
      setCurrentRole("team_leader");
      
      // Clear setup inputs
      setSetupNome("");
      setSetupEmail("");
      setSetupSenha("");
      setSetupConfirm("");

      setTimeout(() => {
        setCurrentPath("/tl/chamadas");
        fetchAllData();
      }, 1000);

    } catch (err: any) {
      setSetupError(err.message || "Erro desconhecido durante bootstrap.");
    } finally {
      setLoggingIn(false);
    }
  };

  // TEAM LEADER INÍCIO DE SESSÃO
  const handleTlLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    
    if (!loginEmail || !loginSenha) {
      setLoginError("Por favor, preencha as credenciais.");
      return;
    }

    try {
      setLoggingIn(true);
      const res = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginSenha })
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || "Credenciais incompatíveis.");
      }

      localStorage.setItem("toyota_andon_user", JSON.stringify(body.user));
      localStorage.setItem("toyota_andon_role", body.role);
      setCurrentUser(body.user);
      setCurrentRole(body.role);
      
      triggerToast(`Sessão iniciada: ${body.user.nome}`, "success");
      setCurrentPath("/tl/chamadas");
      
      // Clean forms
      setLoginEmail("");
      setLoginSenha("");

    } catch (err: any) {
      setLoginError(err.message || "Erro de login.");
    } finally {
      setLoggingIn(false);
    }
  };

  // TEAM MEMBER LOG IN
  const handleTmSelectLogin = async (tm: typeof TEAM_MEMBERS[number]) => {
    try {
      setLoggingIn(true);
      const res = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: tm.email, password: TM_SHARED_PASSWORD })
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || "Não foi possível autenticar o operador seleccionado.");
      }

      localStorage.setItem("toyota_andon_user", JSON.stringify(body.user));
      localStorage.setItem("toyota_andon_role", "team_member");
      setCurrentUser(body.user);
      setCurrentRole("team_member");

      triggerToast(`Posto Operacional Logado: ${body.user.nome}`, "success");
      setCurrentPath("/tm/chamada");

    } catch (err: any) {
      triggerToast(err.message || "Conexão falhou.", "warning");
    } finally {
      setLoggingIn(false);
    }
  };

  // NFC/Card authentication handler
  const handleNfcAuthentic = async (scannedUid: string) => {
    try {
      setLoggingIn(true);
      const res = await fetch("/api/auth/nfc-sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nfc_uid: scannedUid })
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || "Erro de validação do cartão NFC.");
      }

      // Store matching session details
      localStorage.setItem("toyota_andon_user", JSON.stringify(body.user));
      localStorage.setItem("toyota_andon_role", body.role);
      setCurrentUser(body.user);
      setCurrentRole(body.role);

      triggerToast(`Entrada Autorizada: ${body.user.nome} (${body.role === "team_leader" ? "Líder" : "Operador"})`, "success");
      
      // Dynamic routing based on scanned credentials!
      if (body.role === "team_leader") {
        setCurrentPath("/tl/chamadas");
      } else {
        setCurrentPath("/tm/chamada");
      }

    } catch (err: any) {
      triggerToast(err.message || "Erro ao ler o cartão.", "warning");
    } finally {
      setLoggingIn(false);
    }
  };

  const startNfcSession = async (forOperatorId: string | null = null) => {
    setOpScanningId(forOperatorId);
    
    if (!('NDEFReader' in window)) {
      setNfcScannerStatus("Web NFC API não suportada neste browser. Use o simulador de proximidade abaixo.");
      setIsNfcScannerActive(true);
      return;
    }

    try {
      setIsNfcScannerActive(true);
      setNfcScannerStatus("Aguardando aproximação do cartão NFC do telemóvel...");
      
      const ndef = new (window as any).NDEFReader();
      await ndef.scan();
      
      ndef.onreading = (event: any) => {
        const serial = event.serialNumber;
        console.log("NFC Scanned Serial Number:", serial);
        
        triggerToast("LEITURA DE CARTÃO EXECUTADA!", "success");
        setIsNfcScannerActive(false);

        if (forOperatorId) {
          if (forOperatorId === "new") {
            setNewOpNfcUid(serial);
          } else {
            handleUpdateOperatorCard(forOperatorId, serial);
          }
        } else {
          handleNfcAuthentic(serial);
        }
      };

      ndef.onreadingerror = () => {
        setNfcScannerStatus("Falha na leitura. Tente aproximar novamente.");
      };

    } catch (err: any) {
      console.error(err);
      setNfcScannerStatus(`Sensor bloqueado ou sem permissão: ${err.message || err}`);
    }
  };

  const cancelNfcSession = () => {
    setIsNfcScannerActive(false);
    setNfcScannerStatus("");
    setOpScanningId(null);
  };

  // Create operator
  const handleCreateOperator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOpNome.trim()) return;

    try {
      setLoadingConfig(true);
      const res = await fetch("/api/operators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: newOpNome,
          email: newOpEmail,
          role: newOpRole,
          nfc_uid: newOpNfcUid
        })
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || "Erro ao registrar colaborador.");
      }

      triggerToast(`Colaborador cadastrado: ${newOpNome}`, "success");
      setNewOpNome("");
      setNewOpEmail("");
      setNewOpNfcUid("");
      setNewOpRole("team_member");
      fetchAllData();
    } catch (err: any) {
      triggerToast(err.message || "Conexão falhou.", "warning");
    } finally {
      setLoadingConfig(false);
    }
  };

  // Delete operator
  const handleDeleteOperator = async (id: string, name: string) => {
    if (!window.confirm(`Deseja realmente remover o colaborador ${name}?`)) {
      return;
    }

    try {
      setLoadingConfig(true);
      const res = await fetch(`/api/operators/${id}`, {
        method: "DELETE"
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || "Erro ao apagar colaborador.");
      }

      triggerToast(`Colaborador ${name} removido com sucesso.`, "success");
      fetchAllData();
    } catch (err: any) {
      triggerToast(err.message, "warning");
    } finally {
      setLoadingConfig(false);
    }
  };

  // Directly update an operator's NFC UID
  const handleUpdateOperatorCard = async (id: string, serial: string) => {
    try {
      setLoadingConfig(true);
      const res = await fetch(`/api/operators/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nfc_uid: serial })
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || "Erro ao atualizar cartão do colaborador.");
      }

      triggerToast(`Cartão NFC atualizado com sucesso!`, "success");
      fetchAllData();
    } catch (err: any) {
      triggerToast(err.message, "warning");
    } finally {
      setLoadingConfig(false);
    }
  };

  // SUBMIT NEW CALL (TEAM MEMBER)
  const handleCreateCall = async () => {
    if (!selectedLocation || !selectedCallType) {
      triggerToast("Erro: Escolha primeiro o Posto de Trabalho e o Motivo.", "warning");
      return;
    }

    if (!currentUser) return;

    try {
      setSubmittingCall(true);
      const res = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team_member_id: currentUser.id,
          location_id: selectedLocation,
          call_type_id: selectedCallType
        })
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || "Operação não autorizada pelo servidor.");
      }

      setCalls(prev => [body, ...prev]);
      triggerToast(`Chamada de Ajuda efetuada com sucesso: ${body.id}`, "success");
      
    } catch (err: any) {
      triggerToast(err.message || "Erro ao conectar.", "warning");
    } finally {
      setSubmittingCall(false);
    }
  };

  // CANCEL CALL (TM STATE CANCEL)
  const handleCancelCall = async (callId: string) => {
    try {
      const res = await fetch(`/api/calls/${callId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: "cancelada" })
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || "Problemas ao processar cancelamento.");
      }

      setCalls(prev => prev.map(c => c.id === callId ? body : c));
      triggerToast("Pedido de ajuda cancelado.", "info");

    } catch (err: any) {
      triggerToast(err.message || "Erro no cancelamento.", "warning");
    }
  };

  // ASSUME CALL (TL ASSIGNS CALL)
  const handleAssumeCall = async (callId: string) => {
    if (!currentUser) return;
    try {
      unlockAudio(); // Unlock audio loop on interaction
      const res = await fetch(`/api/calls/${callId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estado: "em_atendimento",
          atendida_por: currentUser.id
        })
      });

      const body = await res.json();
      if (!res.ok) {
         throw new Error(body.error || "Houve um erro ao assumir a chamada.");
      }

      setCalls(prev => prev.map(c => c.id === callId ? body : c));
      triggerToast(`Você assumiu a chamada ${body.id}. A caminho!`, "success");

    } catch (err: any) {
      triggerToast(err.message || "Não pôde ser processada.", "warning");
    }
  };

  // COMPLETE CALL FORWARDER (TL CLOSE MODAL SUBMIT)
  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closingCallId) return;

    try {
      const res = await fetch(`/api/calls/${closingCallId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estado: "resolvida",
          observacao: closingObservation.trim() || "Resolução Efetuada."
        })
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || "Erro ao tentar computar encerramento.");
      }

      setCalls(prev => prev.map(c => c.id === closingCallId ? body : c));
      triggerToast(`Chamada ${body.id} encerrada e catalogada com sucesso.`, "success");

      // Reset Modal parameters
      setClosingCallId(null);
      setClosingObservation("");

    } catch (err: any) {
      triggerToast(err.message || "Falha ao enviar.", "warning");
    }
  };

  // -----------------------------------------------------------------
  // 5. CONFIGS OPERATIONS
  // -----------------------------------------------------------------
  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLocationName.trim()) return;

    try {
      setLoadingConfig(true);
      const res = await fetch("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: newLocationName.trim() })
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || "Não pôde incluir.");
      }

      setLocations(prev => [...prev.filter(l => l.id !== body.id), body].sort((a,b)=>a.ordem-b.ordem));
      setNewLocationName("");
      triggerToast("Novo posto de montagem adicionado.", "success");

    } catch (err: any) {
      triggerToast(err.message || "Erro ao adicionar posto.", "warning");
    } finally {
      setLoadingConfig(false);
    }
  };

  const handleAddCallType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCallTypeName.trim()) return;

    try {
      setLoadingConfig(true);
      const res = await fetch("/api/call_types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: newCallTypeName.trim() })
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || "Não pôde incluir.");
      }

      setCallTypes(prev => [...prev, body].sort((a,b)=>a.ordem-b.ordem));
      setNewCallTypeName("");
      triggerToast("Novo tipo de chamada adicionado.", "success");

    } catch (err: any) {
      triggerToast(err.message || "Erro ao adicionar tipo.", "warning");
    } finally {
      setLoadingConfig(false);
    }
  };

  const handleToggleLocation = async (id: string) => {
    try {
      const res = await fetch(`/api/locations/${id}/toggle`, { method: "PUT" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      
      setLocations(prev => prev.map(l => l.id === id ? body : l));
      triggerToast("Status do posto atualizado.", "info");
    } catch (err: any) {
      triggerToast(err.message || "Erro ao atualizar status.", "warning");
    }
  };

  const handleToggleCallType = async (id: string) => {
    try {
      const res = await fetch(`/api/call_types/${id}/toggle`, { method: "PUT" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);

      setCallTypes(prev => prev.map(c => c.id === id ? body : c));
      triggerToast("Status do tipo atualizado.", "info");
    } catch (err: any) {
      triggerToast(err.message || "Erro ao atualizar status.", "warning");
    }
  };

  const handleDeleteLocation = async (id: string) => {
    if (!confirm("Confirmar remoção deste posto de trabalho?")) return;
    try {
      const res = await fetch(`/api/locations/${id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);

      setLocations(prev => prev.filter(l => l.id !== id));
      triggerToast("Posto de trabalho removido com sucesso.", "success");
    } catch (err: any) {
      triggerToast(err.message, "warning");
    }
  };

  const handleDeleteCallType = async (id: string) => {
    if (!confirm("Confirmar remoção deste tipo de chamada?")) return;
    try {
      const res = await fetch(`/api/call_types/${id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);

      setCallTypes(prev => prev.filter(c => c.id !== id));
      triggerToast("Tipo de chamada removido com sucesso.", "success");
    } catch (err: any) {
      triggerToast(err.message, "warning");
    }
  };

  const handleSystemPurgeReset = async () => {
    if (!confirm("ATENÇÃO EXTREMA: Deseja apagar TODO o histórico de chamadas e logs do sistema? Esta ação é irreversível e zerará todos os KPIs!")) return;
    try {
      const res = await fetch("/api/calls/reset", { method: "POST" });
      if (res.ok) {
        setCalls([]);
        setAuditLog([]);
        triggerToast("Banco de dados limpo com sucesso.", "success");
      }
    } catch (err) {
      triggerToast("Falha ao resetar banco de dados.", "warning");
    }
  };

  const earlyIndexCheckFilter = (item: any) => {
    return (current: any) => current.id !== item.id;
  };

  // -----------------------------------------------------------------
  // 6. DASHBOARD CHARTS GENERATIONS (FORMATTER)
  // -----------------------------------------------------------------
  const getCallsByTmData = () => {
    const counts: Record<string, number> = {};
    calls.forEach((c) => {
      const key = c.team_member_nome || "Desconhecido";
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.keys(counts).map(name => ({ name, Chamadas: counts[name] }));
  };

  const getCallsByLocationData = () => {
    const counts: Record<string, number> = {};
    calls.forEach((c) => {
      const key = c.location_nome || "Desconhecido";
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.keys(counts).map(name => ({ name, Chamadas: counts[name] })).slice(0, 8); // top 8
  };

  const getCallsByReasonData = () => {
    const counts: Record<string, number> = {};
    calls.forEach((c) => {
      const key = c.call_type_nome || "Desconhecido";
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.keys(counts).map(name => ({ name, Quantidade: counts[name] }));
  };

  const getCallsByStateData = () => {
    return [
      { name: "Abertas", value: liveStats.abertas, color: "rgb(235, 10, 30)" },
      { name: "Em Atendimento", value: liveStats.emAtendimento, color: "rgb(234, 179, 8)" },
      { name: "Resolvidas", value: liveStats.resolvidas, color: "rgb(34, 197, 94)" },
      { name: "Canceladas", value: liveStats.canceladas, color: "rgb(113, 113, 122)" },
    ].filter(v => v.value > 0);
  };

  // -----------------------------------------------------------------
  // 7. RENDER VIEW DISPATCHERS
  // -----------------------------------------------------------------
  return (
    <div className="flex flex-col min-h-screen bg-neutral-100 text-neutral-900 selection:bg-red-600 selection:text-white pb-16">
      
      {/* Dynamic Upper Top navigation according to routing */}
      <AppBar 
        station={
          currentPath === "/" ? "MENU SELETOR DE CANAL" :
          currentPath.startsWith("/tm") ? `TEAM MEMBER · ${currentUser?.nome || "AGUARDANDO"}` :
          currentPath === "/tl/setup" ? "INITIAL SYSTEM SETUP" :
          `TEAM LEADER TERMINAL · CONTROL ROOM`
        }
        userName={currentUser?.nome}
        roleName={currentRole === "team_leader" ? "TEAM LEADER (TL)" : currentRole === "admin" ? "ADMINISTRADOR (ADMIN)" : "TEAM MEMBER (TM)"}
        syncStatus={syncStatus}
        onSignOut={currentUser ? handleSignOut : undefined}
        right={
          (currentRole === "team_leader" || currentRole === "admin") ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleAudioToggle}
                className={`p-2 transition-all cursor-pointer flex items-center justify-center border-2 border-black/40 shadow-sm ${
                  audioMuted 
                    ? "bg-red-600 border-red-800 text-white animate-pulse" 
                    : "bg-neutral-800 text-green-400 hover:bg-neutral-700"
                }`}
                title={audioMuted ? "Ativar Alertas Sonoros" : "Silenciar Alertas Sonoros"}
              >
                {audioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              
              <button
                onClick={fetchAllData}
                className="p-2 bg-neutral-800 text-white hover:bg-neutral-700 border-2 border-black/40 shadow-sm shrink-0"
                title="Sincronizar Manual"
              >
                <RefreshCw className="w-4 h-4 animate-spin-reverse" />
              </button>
            </div>
          ) : undefined
        }
      />

      {/* Floating System Warning Notification block (HMI Warning style) */}
      {floatingToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 max-w-sm w-full bg-neutral-900 border-l-4 border-l-red-600 text-white p-3 z-50 flex gap-2.5 items-center justify-between font-mono text-xs shadow-xl shadow-black/80">
          <div className="flex items-center gap-2">
            <span className="shrink-0 p-1 bg-red-600 animate-pulse text-white block rounded-sm">ALERTA</span>
            <span className="font-bold tracking-tight text-neutral-100">{floatingToast.message}</span>
          </div>
          <button 
            onClick={() => setFloatingToast(null)}
            className="text-neutral-500 hover:text-white cursor-pointer font-bold shrink-0 text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* Primary Layout Container grid */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-6">

        {/* -------------------------------------------------- */}
        {/* PATH = "/" (MAIN CHOICE SCREEN) */}
        {/* -------------------------------------------------- */}
        {currentPath === "/" && (
          <div className="max-w-4xl mx-auto py-10 flex flex-col gap-10">
            {/* Header Title block */}
            <div className="hmi-panel flex flex-col items-center text-center gap-2 bg-neutral-900 text-white border-b-4 border-r-4">
              <h2 className="text-xl md:text-2xl font-black font-mono tracking-tight text-red-600 uppercase">
                ⚙️ LOGÍSTICA TOYOTA · ANDON CALL SYSTEM
              </h2>
              <p className="text-xs md:text-sm text-neutral-400 font-mono tracking-wider max-w-2xl px-4">
                Plataforma integrada de chamadas e sinalização operacional em tempo real da linha logística Toyota. Selecione o terminal apropriado.
              </p>
            </div>

            {/* Config banner state check */}
            {!tlExists && (
              <div className="bg-amber-100 border-2 border-dashed border-amber-600 p-4 font-mono text-xs tracking-tight text-amber-900 flex flex-col sm:flex-row gap-4 items-center justify-between shadow-sm animate-pulse">
                <div className="flex items-center gap-2.5">
                  <AlertOctagon className="w-6 h-6 text-amber-600 shrink-0" />
                  <div>
                    <h5 className="font-bold uppercase text-sm">CONFIGURAÇÃO INICIAL CONFIG-01</h5>
                    <p className="text-amber-800">Nenhum Team Leader está cadastrado. Execute o bootstrap do sistema para prosseguir.</p>
                  </div>
                </div>
                <button
                  onClick={() => setCurrentPath("/tl/setup")}
                  className="w-full sm:w-auto p-2 bg-amber-600 text-black hover:bg-black hover:text-white transition-all font-bold uppercase text-xs cursor-pointer px-4 shadow-sm"
                >
                  Inicializar Setup Panel →
                </button>
              </div>
            )}

            {/* Portal Cards Selection Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
              
              {/* TM SECTOR CARD */}
              <div className="hmi-panel flex flex-col justify-between group hover:border-red-600 hover:shadow-[6px_6px_0px_#EB0A1E] transition-all bg-white">
                <div className="flex flex-col gap-4">
                  <div className="flex justify-between items-start">
                    <div className="p-3 bg-red-100 border border-red-200">
                      <HardHat className="w-8 h-8 text-[#EB0A1E]" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold font-mono text-black uppercase tracking-tight group-hover:text-red-600 transition-colors">
                      Team Member (TM)
                    </h3>
                    <p className="text-xs text-neutral-600 font-sans mt-2 leading-relaxed">
                      Painel para operadores de linha. Adequado para smartphones e tablets Android. Permite solicitar assistência logística urgente em 1 toque.
                    </p>
                  </div>
                </div>
                <div className="mt-8">
                  <button
                    onClick={() => {
                      unlockAudio();
                      setCurrentPath("/tm/login");
                    }}
                    className="w-full p-3 bg-red-600 hover:bg-black text-white font-mono uppercase font-black tracking-widest text-sm transition-all shadow-md active:scale-95 duration-100 cursor-pointer text-center block"
                  >
                    ACESSAR TERMINAL OPERADOR
                  </button>
                </div>
              </div>

              {/* TL SECTOR CARD */}
              <div className="hmi-panel flex flex-col justify-between group hover:border-neutral-950 hover:shadow-[6px_6px_0px_#18181b] transition-all bg-white">
                <div className="flex flex-col gap-4">
                  <div className="flex justify-between items-start">
                    <div className="p-3 bg-neutral-900 text-neutral-100 border border-neutral-950">
                      <ShieldCheck className="w-8 h-8 text-neutral-100" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold font-mono text-neutral-900 uppercase tracking-tight">
                      Team Leader (TL)
                    </h3>
                    <p className="text-xs text-neutral-600 font-sans mt-2 leading-relaxed">
                      Painel do supervisor da linha para tablets Windows e PCs. Gerenciamento ativo de chamadas, alertas sonoros e KPIs de throughput de atendimento.
                    </p>
                  </div>
                </div>
                <div className="mt-8">
                  <button
                    onClick={() => {
                      unlockAudio();
                      setCurrentPath("/tl/login");
                    }}
                    className="w-full p-3 bg-neutral-900 hover:bg-neutral-800 text-white font-mono uppercase font-black tracking-widest text-sm transition-all shadow-md active:scale-95 duration-100 cursor-pointer text-center block border border-neutral-950"
                  >
                    ACESSAR TERMINAL LÍDER
                  </button>
                </div>
              </div>

            </div>

            {/* Minimal/Discreet TV channel selection button */}
            <div className="flex justify-center -mt-2">
              <button
                onClick={() => {
                  unlockAudio();
                  setCurrentPath("/tv");
                }}
                className="px-6 py-2.5 bg-neutral-200 hover:bg-neutral-800 hover:text-white border-2 border-neutral-800 text-neutral-800 font-mono text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer shadow-sm flex items-center gap-2"
              >
                🖥️ MONITOR DE TRANSMISSÃO (TV ANDON)
              </button>
            </div>


          </div>
        )}

        {/* -------------------------------------------------- */}
        {/* PATH = "/tm/login" (TEAM MEMBER CHOOSE NAME WITH NFC CARDS) */}
        {/* -------------------------------------------------- */}
        {currentPath === "/tm/login" && (
          <div className="max-w-md mx-auto py-6">
            <button 
              onClick={() => setCurrentPath("/")} 
              className="mb-4 inline-flex items-center gap-1.5 font-mono text-xs uppercase px-2 py-1.5 hover:bg-neutral-200 text-neutral-600 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao Menu
            </button>

            <div className="hmi-panel flex flex-col gap-6 bg-white relative overflow-hidden">
              <div className="border-b-2 border-black pb-4">
                <h3 className="text-base font-mono font-bold uppercase tracking-tight text-neutral-900 flex items-center gap-2">
                  <HardHat className="w-5 h-5 text-red-600 animate-pulse" />
                  Terminal de Leitura NFC
                </h3>
                <p className="text-xs text-neutral-500 font-mono mt-1">
                  Aproxime o cartão de colaborador para se autenticar localmente no telemóvel.
                </p>
              </div>

              {/* Pulsing NFC Sensor Zone Illustration */}
              <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-neutral-300 bg-neutral-50 rounded-lg text-center gap-4 relative">
                {/* Visual ripple pulse */}
                <div className="absolute inset-0 flex items-center justify-center opacity-10">
                  <div className="w-32 h-32 bg-[#EB0A1E] rounded-full animate-ping"></div>
                </div>

                <div className="w-20 h-20 bg-neutral-900 text-white flex items-center justify-center rounded-full relative z-10 shadow-lg border-4 border-white">
                  <Database className="w-10 h-10 text-red-500" />
                </div>
                
                <div className="z-10 font-mono">
                  <div className="text-xs font-bold text-neutral-800 uppercase tracking-widest animate-pulse">
                    Leitor NFC Ativo
                  </div>
                  <div className="text-[10px] text-neutral-500 uppercase mt-1">
                    Sensor do telemóvel pronto a detetar cartões
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => startNfcSession()}
                  className="px-4 py-2 bg-[#EB0A1E] hover:bg-black text-white font-mono text-[10px] font-bold uppercase border-2 border-black transition-colors cursor-pointer z-10 shadow"
                >
                  📡 Lançar Leitor Web NFC
                </button>
              </div>

              {loggingIn ? (
                <div className="py-6 flex flex-col items-center justify-center gap-4 text-neutral-600 font-mono text-xs">
                  <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
                  <span>Autenticando sessão com o cartão lido...</span>
                </div>
              ) : (
                <div className="flex flex-col gap-4 font-mono text-xs">
                  {/* SIMULATOR INPUT ZONE */}
                  <div className="p-3.5 bg-neutral-900 text-white border-2 border-black">
                    <h4 className="text-[10px] font-black uppercase text-red-500 tracking-wider mb-2 text-center">
                       Simulador de Cartão NFC (Para PC ou Sem Web NFC)
                    </h4>
                    
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Ex: 74:EA:91:10, 10:91:ea:74..."
                        id="simulated-nfc-input"
                        className="flex-1 p-2 bg-neutral-950 border border-neutral-700 text-white text-xs font-bold font-mono focus:outline-none focus:border-red-500 uppercase"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const val = (e.target as HTMLInputElement).value;
                            if (val) handleNfcAuthentic(val);
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const val = (document.getElementById("simulated-nfc-input") as HTMLInputElement)?.value;
                          if (val) handleNfcAuthentic(val);
                        }}
                        className="p-2 px-3 bg-red-600 hover:bg-red-700 text-white font-bold cursor-pointer text-[10px] uppercase transition-colors"
                      >
                        Aproximar
                      </button>
                    </div>

                    {/* Pre-seeded card testing selectors */}
                    <div className="mt-3 flex flex-col gap-1.5 border-t border-neutral-800 pt-3">
                      <p className="text-[9px] text-neutral-400 uppercase tracking-tight text-center">
                        Selecione um cartão de teste rápido:
                      </p>
                      
                      <div className="grid grid-cols-2 gap-1.5 text-[9px] font-mono">
                        <button
                          type="button"
                          onClick={() => handleNfcAuthentic("74:EA:91:10")}
                          className="p-1 px-1.5 bg-neutral-800 hover:bg-red-800 text-white text-left transition-colors cursor-pointer border border-neutral-700 truncate"
                        >
                          🔑 Cartão TL: 74:EA:91:10
                        </button>
                        <button
                          type="button"
                          onClick={() => handleNfcAuthentic("04:12:45:78")}
                          className="p-1 px-1.5 bg-neutral-800 hover:bg-neutral-700 text-white text-left transition-colors cursor-pointer border border-neutral-700 truncate"
                        >
                          👤 TM1: 04:12:45:78
                        </button>
                        <button
                          type="button"
                          onClick={() => handleNfcAuthentic("54:ea:71:02")}
                          className="p-1 px-1.5 bg-neutral-800 hover:bg-neutral-700 text-white text-left transition-colors cursor-pointer border border-neutral-700 truncate"
                        >
                          👤 TM2: 54:ea:71:02
                        </button>
                        <button
                          type="button"
                          onClick={() => handleNfcAuthentic("12:bc:90:ee")}
                          className="p-1 px-1.5 bg-neutral-800 hover:bg-neutral-700 text-white text-left transition-colors cursor-pointer border border-neutral-700 truncate"
                        >
                          👤 TM3: 12:bc:90:ee
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Fallback Selector for direct login if needed */}
                  <div className="border-t border-neutral-200 pt-3">
                    <p className="text-[10px] font-bold uppercase text-neutral-700 tracking-wide mb-2">
                      👥 Entrada alternativa sem cartão (Manual):
                    </p>
                    <div className="flex flex-wrap gap-1.5 font-mono">
                      {operators.filter(op => op.role === "team_member").map((op) => (
                        <button
                          key={op.id}
                          onClick={() => handleTmSelectLogin(op as any)}
                          className="p-1.5 px-2 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 text-neutral-800 text-[9px] uppercase font-bold transition-colors cursor-pointer"
                        >
                          {op.nome}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-neutral-100 p-2 text-center text-[9px] text-neutral-500 uppercase tracking-tight font-mono">
                * Cartões lidos incorretamente ou de trás para a frente são corrigidos de forma inteligente.
              </div>
            </div>
          </div>
        )}

        {/* -------------------------------------------------- */}
        {/* PATH = "/tm/chamada" (TEAM MEMBER ACTIVE DESK CALL INTERFACE) */}
        {/* -------------------------------------------------- */}
        {currentPath === "/tm/chamada" && currentUser && (
          <div className="max-w-2xl mx-auto py-4">
            
            {/* Operator Greeting Card info */}
            <div className="p-3.5 border-2 border-black bg-neutral-900 text-white font-mono text-[11px] uppercase tracking-wider flex justify-between items-center mb-6 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse"></span>
                <span>Operador: <strong className="text-red-500">{currentUser.nome}</strong></span>
              </div>
              <span>REGISTRO: {currentUser.id.toUpperCase()}</span>
            </div>

            {(() => {
              const activeCall = getActiveOperatorCall();

              if (!activeCall) {
                // STATE A: NO CALL CURRENTLY ACTIVE -> SUBMIT BOX FORMAT
                return (
                  <div className="hmi-panel bg-white flex flex-col gap-6">
                    <div>
                      <h4 className="text-md font-mono font-extrabold uppercase tracking-tight text-[#EB0A1E] border-b-2 border-black pb-2">
                        ▶ SOLICITAR AJUDA AO TEAM LEADER
                      </h4>
                      <p className="text-xs text-neutral-500 font-mono mt-1.5">
                        Escolha o posto logístico (DE ONDE) e o motivo da ajuda (O QUÊ).
                      </p>
                    </div>

                    {/* Step 1: Location selection */}
                    <div className="flex flex-col gap-2">
                      <label className="text-[11px] font-mono tracking-widest uppercase text-neutral-600 font-extrabold">
                        1. POSTO DE TRABALHO / LOCAL DE MONTAGEM
                      </label>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {locations.filter(l => l.ativo).map((loc) => (
                          <button
                            key={loc.id}
                            onClick={() => setSelectedLocation(loc.id)}
                            className={`p-2.5 border-2 font-mono text-xs font-bold transition-all uppercase text-center cursor-pointer ${
                              selectedLocation === loc.id
                                ? "bg-red-600 text-white border-red-800 shadow-[2px_2px_0px_#000]"
                                : "bg-neutral-50 border-neutral-800 text-neutral-800 hover:bg-neutral-100"
                            }`}
                          >
                            {loc.nome}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Step 2: Call type selection */}
                    <div className="flex flex-col gap-2 mt-2">
                      <label className="text-[11px] font-mono tracking-widest uppercase text-neutral-600 font-extrabold">
                        2. TIPO DE CHAMADA (CLASSIFICAÇÃO DO ERRO)
                      </label>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {callTypes.filter(ct => ct.ativo).map((type) => (
                          <button
                            key={type.id}
                            onClick={() => setSelectedCallType(type.id)}
                            className={`p-2.5 border-2 font-mono text-xs font-bold transition-all uppercase text-center cursor-pointer ${
                              selectedCallType === type.id
                                ? "bg-red-600 text-white border-red-800 shadow-[2px_2px_0px_#000]"
                                : "bg-neutral-50 border-neutral-800 text-neutral-800 hover:bg-neutral-100"
                            }`}
                          >
                            {type.nome}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Submit Button */}
                    <div className="border-t-2 border-black pt-4 mt-2">
                      <button
                        onClick={handleCreateCall}
                        disabled={submittingCall || !selectedLocation || !selectedCallType}
                        className={`w-full p-4 font-mono font-black tracking-widest uppercase text-md transition-all border-2 border-black flex items-center justify-center gap-3 shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none translate-x-0 hover:translate-x-1 hover:translate-y-1 active:translate-x-1 active:translate-y-1 duration-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none cursor-pointer ${
                          (selectedLocation && selectedCallType) 
                            ? "bg-red-600 hover:bg-black hover:text-white text-white" 
                            : "bg-neutral-200 text-neutral-500"
                        }`}
                      >
                        {submittingCall ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>ENVIANDO REQUISIÇÃO...</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-5 h-5 text-black bg-white p-1 rounded-sm shrink-0" />
                            <span>TRANSMITIR CHAMADA DE AJUDA</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              } else {
                // STATE B: TM ALREADY HAS ACTIVE INCOMPLETE CALL
                const isResolvedActive = activeCall.estado === "aberta";
                return (
                  <div className="hmi-panel bg-white flex flex-col gap-6 relative overflow-hidden">
                    
                    {/* Visual warning hazard block */}
                    {isResolvedActive ? (
                      <div className="absolute top-0 left-0 right-0 hazard-tape-thin-red"></div>
                    ) : (
                      <div className="absolute top-0 left-0 right-0 hazard-tape-thin"></div>
                    )}

                    <div className="pt-3">
                      <div className="flex justify-between items-center border-b-2 border-neutral-800 pb-3">
                        <div>
                          <span className="font-mono text-xs bg-black text-white px-2.5 py-1 uppercase font-bold tracking-widest rounded-sm">
                            {activeCall.id}
                          </span>
                          <span className="font-mono text-[11px] text-neutral-400 ml-2">SIMULAÇÃO ANDON</span>
                        </div>
                        <span className={`px-3 py-1 text-xs font-black font-mono uppercase border-2 ${
                          isResolvedActive 
                            ? "text-[#EB0A1E] border-[#EB0A1E] animate-pulse" 
                            : "text-amber-500 border-amber-500 progress-pulse bg-amber-50"
                        }`}>
                          {activeCall.estado === "aberta" ? "EM FILA · ABERTA" : "ATENDIMENTO ATIVO"}
                        </span>
                      </div>
                    </div>

                    {/* Active Timer visualizer */}
                    <div className="flex flex-col items-center justify-center py-8 bg-neutral-50 border-2 border-neutral-200 shadow-inner">
                      <span className="text-[10px] uppercase font-mono tracking-widest text-neutral-500 font-extrabold mb-1">
                        TEMPO ELAPSO DE SOLICITAÇÃO
                      </span>
                      <span className="text-4xl md:text-5xl font-mono font-black text-black tracking-widest select-none">
                        {formatStopWatch(activeCall.aberta_em)}
                      </span>
                    </div>

                    {/* Operational logs definitions */}
                    <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                      <div className="p-3 bg-neutral-50 border border-neutral-200">
                        <span className="text-neutral-400 block text-[9px] font-bold uppercase tracking-widest">POSTO / LOCAL</span>
                        <strong className="text-neutral-900 text-sm">{activeCall.location_nome || "Posto Solicitante"}</strong>
                      </div>
                      <div className="p-3 bg-neutral-50 border border-neutral-200">
                        <span className="text-neutral-400 block text-[9px] font-bold uppercase tracking-widest">MOTIVO / AJUDA</span>
                        <strong className="text-neutral-900 text-sm">{activeCall.call_type_nome || "Motivo Classificado"}</strong>
                      </div>
                    </div>

                    {/* Dynamic state notification message block */}
                    <div className="p-4 border-2 flex items-center gap-3 font-mono text-xs uppercase ${
                      isResolvedActive ? 'border-red-600 bg-red-50 text-red-900' : 'border-amber-500 bg-amber-50 text-amber-900'
                    }">
                      {isResolvedActive ? (
                        <>
                          <AlertOctagon className="w-5 h-5 text-red-600 shrink-0 animate-bounce" />
                          <div className="flex-1">
                            <h6 className="font-black">Team Leader Notificado!</h6>
                            <p className="text-[10px] text-red-800 font-sans mt-0.5 normal-case leading-tight">
                              Seu pedido emitiu sinal sonoro no terminal de controle. Por favor, aguarde estabilizado no seu posto de trabalho.
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-5 h-5 text-amber-500 shrink-0" />
                          <div className="flex-1">
                            <h6 className="font-black text-amber-600">Supervisor a caminho!</h6>
                            <p className="text-[10px] text-amber-800 font-sans mt-0.5 normal-case leading-tight">
                              Seu chamado foi assumido pelo Team Leader <strong className="font-bold underline">{activeCall.atendida_por_nome || "Líder"}</strong> às {new Date(activeCall.atendida_em!).toLocaleTimeString()}.
                            </p>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Cancel Action (Only allowed if call state is aberta) */}
                    {isResolvedActive && (
                      <div className="border-t-2 border-black pt-4">
                        <button
                          onClick={() => handleCancelCall(activeCall.id)}
                          className="w-full p-2.5 bg-neutral-100 hover:bg-neutral-800 hover:text-white border-2 border-neutral-800 text-neutral-800 hover:border-black font-mono font-bold uppercase text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Ban className="w-4 h-4 text-red-600" />
                          <span>Cancelar Chamado de Ajuda</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              }
            })()}
          </div>
        )}

        {/* -------------------------------------------------- */}
        {/* PATH = "/tl/login" (TEAM LEADER LOG IN FORM) */}
        {/* -------------------------------------------------- */}
        {currentPath === "/tl/login" && (
          <div className="max-w-md mx-auto py-10">
            <button 
              onClick={() => setCurrentPath("/")} 
              className="mb-4 inline-flex items-center gap-1.5 font-mono text-xs uppercase px-2 py-1.5 hover:bg-neutral-200 text-neutral-600 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao Menu
            </button>

            <div className="hmi-panel flex flex-col gap-6 bg-white">
              <div className="border-b-2 border-black pb-4">
                <h3 className="text-base font-mono font-bold uppercase tracking-tight text-neutral-900 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-neutral-800" />
                  Acesso Restrito: Team Leader
                </h3>
                <p className="text-xs text-neutral-500 font-mono mt-1">
                  Painel de Monitoramento Geral de Chamadas e Auditoria Andon.
                </p>
              </div>

              {loginError && (
                <div className="p-3 bg-red-100 border border-red-200 text-red-900 font-mono text-xs uppercase tracking-tight flex items-center gap-2 animate-shake">
                  <AlertOctagon className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              <form onSubmit={handleTlLoginSubmit} className="flex flex-col gap-4 font-mono text-xs">
                <div className="flex flex-col gap-1.5">
                  <label className="text-neutral-600 font-extrabold uppercase">Email do Supervisor:</label>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="ex: tl.supervisor@toyota.local"
                    className="p-3 border-2 border-neutral-800 focus:border-red-600 focus:outline-none bg-neutral-50 text-neutral-900 font-bold"
                  />
                </div>
                
                <div className="flex flex-col gap-1.5">
                  <label className="text-neutral-600 font-extrabold uppercase">Senha de Acesso:</label>
                  <input
                    type="password"
                    value={loginSenha}
                    onChange={(e) => setLoginSenha(e.target.value)}
                    placeholder="••••••••"
                    className="p-3 border-2 border-neutral-800 focus:border-red-600 focus:outline-none bg-neutral-50 text-neutral-900 font-bold"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loggingIn}
                  className="w-full p-3.5 bg-neutral-900 hover:bg-[#EB0A1E] text-white font-black uppercase font-mono tracking-widest text-sm transition-all border-2 border-neutral-950 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 mt-2 shadow-[3px_3px_0px_#000]"
                >
                  {loggingIn ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>AUTENTICANDO...</span>
                    </>
                  ) : (
                    "SINC_LOGIN_TL_PANEL"
                  )}
                </button>
              </form>

              {!tlExists && (
                <div className="p-4 bg-amber-50 border border-amber-300 font-mono text-xs text-center">
                  <p className="text-amber-900">Primeira vez executando o sistema?</p>
                  <button
                    onClick={() => setCurrentPath("/tl/setup")}
                    className="mt-2 text-[#EB0A1E] font-bold underline uppercase tracking-tight hover:text-black cursor-pointer"
                  >
                    Fazer Setup / Bootstrap de Contas →
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* -------------------------------------------------- */}
        {/* PATH = "/tl/setup" (INITIAL SYSTEM SETUP PANEL) */}
        {/* -------------------------------------------------- */}
        {currentPath === "/tl/setup" && (
          <div className="max-w-md mx-auto py-6">
            <button 
              onClick={() => setCurrentPath("/")} 
              className="mb-4 inline-flex items-center gap-1.5 font-mono text-xs uppercase px-2 py-1.5 hover:bg-neutral-200 text-neutral-600 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao Selector
            </button>

            <div className="hmi-panel flex flex-col gap-6 bg-white relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 hazard-tape-thin"></div>

              <div className="border-b-2 border-black pb-4 pt-3">
                <h3 className="text-base font-mono font-bold uppercase tracking-tight text-[#EB0A1E] flex items-center gap-2">
                  <Database className="w-5 h-5 text-black" />
                  Bootstrap Setup: Toyota Call System
                </h3>
                <p className="text-xs text-neutral-500 font-mono mt-1">
                  Inicialização rápida do banco de dados, contas de Team Leaders e os 4 Team Members.
                </p>
              </div>

              {setupError && (
                <div className="p-3 bg-red-100 border border-red-200 text-red-900 font-mono text-xs uppercase tracking-tight animate-shake flex items-center gap-2">
                  <AlertOctagon className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{setupError}</span>
                </div>
              )}

              {setupSuccess && (
                <div className="p-3 bg-green-100 border border-green-200 text-green-900 font-mono text-xs uppercase tracking-tight animate-pulse">
                  ✓ Configuração realizada com sucesso! Redirecionando...
                </div>
              )}

              <form onSubmit={handleSetupSubmit} className="flex flex-col gap-3 font-mono text-[11px]">
                <div className="flex flex-col gap-1">
                  <label className="text-neutral-600 font-bold uppercase">Nome do Supervisor Líder (TL):</label>
                  <input
                    type="text"
                    value={setupNome}
                    onChange={(e) => setSetupNome(e.target.value)}
                    placeholder="Ex: Manuel Silva"
                    required
                    className="p-2.5 border-2 border-neutral-800 text-xs focus:border-red-600 focus:outline-none bg-neutral-50 text-neutral-900 font-bold"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-neutral-600 font-bold uppercase">E-mail Corporativo:</label>
                  <input
                    type="email"
                    value={setupEmail}
                    onChange={(e) => setSetupEmail(e.target.value)}
                    placeholder="Ex: msilva@toyota-ovar.local"
                    required
                    className="p-2.5 border-2 border-neutral-800 text-xs focus:border-red-600 focus:outline-none bg-neutral-50 text-neutral-900 font-bold"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-neutral-600 font-bold uppercase">Senha de Segurança (Min 5 carac.):</label>
                  <input
                    type="password"
                    value={setupSenha}
                    onChange={(e) => setSetupSenha(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="p-2.5 border-2 border-neutral-800 text-xs focus:border-red-600 focus:outline-none bg-neutral-50 text-neutral-900 font-bold"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-neutral-600 font-bold uppercase">Confirmar Senha:</label>
                  <input
                    type="password"
                    value={setupConfirm}
                    onChange={(e) => setSetupConfirm(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="p-2.5 border-2 border-neutral-800 text-xs focus:border-red-600 focus:outline-none bg-neutral-50 text-neutral-900 font-bold"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loggingIn || setupSuccess}
                  className="w-full p-3.5 bg-red-600 hover:bg-black text-white font-black uppercase font-mono tracking-widest text-xs transition-all border-2 border-red-700 disabled:opacity-50 mt-4 shadow-[4px_4px_0px_rgba(0,0,0,1)] cursor-pointer text-center block"
                >
                  {loggingIn ? "SEEDING DATABASE SYSTEMS..." : "BOOTSTRAP_SEED_DATABASE"}
                </button>
              </form>

              <div className="p-3 bg-neutral-50 border border-neutral-200 text-[10px] text-neutral-500 font-mono uppercase tracking-tight leading-normal">
                <strong>EFEITO DO BOOTSTRAP:</strong>
                <ol className="list-decimal list-inside mt-1.5 space-y-1">
                  <li>Cria tabela profiles + roles</li>
                  <li>Injeta as tabelas default de locais e motivos</li>
                  <li>Ativa as regras de segurança RLS</li>
                  <li>Registra 4 contas operador com senha: <code className="font-bold underline text-red-600">{TM_SHARED_PASSWORD}</code></li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {/* -------------------------------------------------- */}
        {/* PATH = "/tl/chamadas" (MAIN REALTIME LIST FOR LÍDERES) */}
        {/* -------------------------------------------------- */}
        {currentPath === "/tl/chamadas" && currentUser && (
          <div className="flex flex-col gap-6">
            
            {/* Upper Navigation Tabs Ribbon matched styled */}
            <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3 bg-neutral-900 p-2.5 border-2 border-black shadow">
              <div className="flex flex-wrap gap-1.5 font-mono text-xs font-bold uppercase text-white">
                <button 
                  onClick={() => setCurrentPath("/tl/chamadas")}
                  className="p-2.5 bg-[#EB0A1E] text-white border border-[#EB0A1E] select-none flex items-center gap-2"
                >
                  <Activity className="w-4 h-4" />
                  <span>FILA EM TIEMPO REAL ({calls.filter(c=>c.estado==="aberta" || c.estado==="em_atendimento").length})</span>
                </button>
                
                <button 
                  onClick={() => {
                    unlockAudio();
                    setCurrentPath("/tl/dashboard");
                  }}
                  className="p-2.5 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors cursor-pointer flex items-center gap-2"
                >
                  <BarChart2 className="w-4 h-4" />
                  <span>Painel KPI & Estatísticas</span>
                </button>
                
                <button 
                  onClick={() => {
                    unlockAudio();
                    setCurrentPath("/tl/config");
                  }}
                  className="p-2.5 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors cursor-pointer flex items-center gap-2"
                >
                  <Settings className="w-4 h-4" />
                  <span>Configurações & Purge</span>
                </button>
              </div>

              {/* Status active counter log */}
              <div className="flex items-center gap-3 self-end px-3 font-mono text-xs uppercase text-white tracking-wider">
                <span className="text-neutral-400">STATUS ALERTA:</span>
                {calls.some(c=>c.estado === "aberta") ? (
                  <span className="p-1 px-2.5 bg-red-600 animate-pulse text-white font-black rounded-sm">
                    ⚠️ ALERTA ANDON LOOPING ATIVO
                  </span>
                ) : (
                  <span className="p-1 px-2.5 bg-green-600 text-white font-black rounded-sm flex items-center gap-1.5">
                    <span className="status-dot"></span> LINHA OPERANDO SEGURO
                  </span>
                )}
              </div>
            </div>

            {/* Middle Quick KPIs counter strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono">
              <div className="bg-white border-2 border-black p-4 flex flex-col justify-between shadow-sm">
                <span className="text-neutral-500 text-[10px] font-bold uppercase tracking-widest block leading-none">ABERTAS (AGUARDANDO TL)</span>
                <span className={`text-3xl font-black block mt-2 ${liveStats.abertas > 0 ? "text-[#EB0A1E] animate-bounce" : "text-black"}`}>
                  {liveStats.abertas}
                </span>
              </div>
              <div className="bg-white border-2 border-black p-4 flex flex-col justify-between shadow-sm">
                <span className="text-neutral-500 text-[10px] font-bold uppercase tracking-widest block leading-none">EM CURSO EN ATENDIMENTO</span>
                <span className={`text-3xl font-black block mt-2 ${liveStats.emAtendimento > 0 ? "text-amber-500" : "text-black"}`}>
                  {liveStats.emAtendimento}
                </span>
              </div>
              <div className="bg-white border-2 border-black p-4 flex flex-col justify-between shadow-sm">
                <span className="text-neutral-500 text-[10px] font-bold uppercase tracking-widest block leading-none">MÉDIO TEMP RESPOSTA</span>
                <span className="text-2xl font-black block mt-2 text-black text-ellipsis overflow-hidden">
                  {formatSecsToDurationLabel(liveStats.tempoMedioAtendimento)}
                </span>
              </div>
              <div className="bg-white border-2 border-black p-4 flex flex-col justify-between shadow-sm">
                <span className="text-neutral-500 text-[10px] font-bold uppercase tracking-widest block leading-none">ALERTA AUDITÓRIA</span>
                <span className={`text-sm font-bold block mt-3.5 uppercase leading-none ${audioMuted ? "text-red-600" : "text-green-600"}`}>
                  {audioMuted ? "🔊 SILENCIADO" : "🔊 LOOP SONORO ATIVO"}
                </span>
              </div>
            </div>

            {/* Core Action: Closure comment mini modal overlay */}
            {closingCallId && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                <div className="bg-white border-4 border-black p-6 w-full max-w-md font-mono text-sm shadow-2xl animate-scaleIn">
                  <div className="border-b-2 border-black pb-3 mb-4">
                    <h5 className="font-extrabold uppercase text-[#EB0A1E] text-md">
                      ✓ ENCERRAR CHAMADO {closingCallId}
                    </h5>
                    <p className="text-[11px] text-neutral-500 mt-1">
                      Adicione informações sobre a ação corretiva tomada na linha de produção para arquivamento industrial.
                    </p>
                  </div>

                  <form onSubmit={handleResolveSubmit} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-neutral-600 font-bold uppercase">Ações Tomadas / Observações:</label>
                      <textarea
                        value={closingObservation}
                        onChange={(e) => setClosingObservation(e.target.value)}
                        placeholder="Ex: Efetuado abastecimento complementar de mangueiras. Linha re-estabilizada."
                        required
                        rows={4}
                        className="p-3 border-2 border-neutral-800 text-xs focus:border-red-600 focus:outline-none bg-neutral-50 text-neutral-900 font-semibold"
                      />
                    </div>

                    <div className="flex gap-2.5 justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setClosingCallId(null);
                          setClosingObservation("");
                        }}
                        className="p-2 border border-neutral-700 bg-neutral-100 hover:bg-neutral-200 uppercase font-bold text-xs cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="p-2 bg-green-600 hover:bg-black text-white hover:text-white border-2 border-green-700 font-black uppercase text-xs cursor-pointer px-4 shadow-sm"
                      >
                        ENCERRAR CHAMADA NO HISTÓRICO
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* List of active calls (grid display) */}
            {calls.filter(c => c.estado === "aberta" || c.estado === "em_atendimento").length === 0 ? (
              // Stable production feed state
              <div className="hmi-panel flex flex-col items-center justify-center py-20 text-center gap-4 bg-white">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center animate-pulse border-2 border-green-500 shadow-sm">
                  <Check className="w-8 h-8 text-green-600" strokeWidth={3} />
                </div>
                <div>
                  <h4 className="text-lg font-mono font-black text-green-600 uppercase tracking-widest leading-none">
                    SÍTIO ESTÁVEL: SEM CHAMADAS DE LOGÍSTICA
                  </h4>
                  <p className="text-xs text-neutral-400 font-mono mt-2 tracking-tight">
                    Todas as solicitações de operadores Team Members estão resolvidas. Nenhuma ação necessária.
                  </p>
                </div>
              </div>
            ) : (
              // Active grid alert cards
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {calls.filter(c => c.estado === "aberta" || c.estado === "em_atendimento").map((call) => {
                  const isOpen = call.estado === "aberta";
                  return (
                    <div 
                      key={call.id} 
                      className={`hmi-panel bg-white flex flex-col justify-between relative overflow-hidden transition-all border-2 ${
                        isOpen 
                          ? "border-red-600 shadow-[6px_6px_0px_#EB0A1E] ring-2 ring-red-500/10" 
                          : "border-amber-500 shadow-[6px_6px_0px_rgb(245,158,11)]"
                      }`}
                    >
                      {/* Alert diagonal banner decorator */}
                      {isOpen ? (
                        <div className="absolute top-0 left-0 right-0 hazard-tape-thin-red"></div>
                      ) : (
                        <div className="absolute top-0 left-0 right-0 hazard-tape-thin"></div>
                      )}

                      <div className="pt-3">
                        <div className="flex justify-between items-start border-b-2 border-neutral-100 pb-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-black bg-neutral-900 text-white px-2 py-0.5 uppercase tracking-wider rounded-sm">
                              {call.id}
                            </span>
                            <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest">
                              TRANSMITIDO HÁ {formatStopWatch(call.aberta_em)}
                            </span>
                          </div>
                          <span className={`text-[10px] font-black font-mono uppercase px-2 py-0.5 border ${
                            isOpen 
                              ? "text-[#EB0A1E] border-[#EB0A1E] animate-pulse bg-red-50" 
                              : "text-amber-600 border-amber-500 bg-amber-50"
                          }`}>
                            {isOpen ? "🚨 OPERADOR CLAMANDO RECURSO" : "🚧 EM ATENDIMENTO"}
                          </span>
                        </div>
                      </div>

                      {/* Operational Caller details */}
                      <div className="my-5 flex flex-col gap-4">
                        <div className="flex flex-col">
                          <span className="text-[9px] font-mono text-neutral-400 uppercase tracking-widest block leading-none">TEAM MEMBER (OPERANTE)</span>
                          <span className="text-2xl font-black font-mono text-neutral-900 tracking-wide select-text mt-1 uppercase">
                            {call.team_member_nome || "Operador Indefinido"}
                          </span>
                        </div>

                        <div className="flex flex-col">
                          <span className="text-[9px] font-mono text-neutral-400 uppercase tracking-widest block leading-none">POSTO DE TRABALHO DE ORIGEM</span>
                          <span className="text-2xl font-black font-mono text-[#EB0A1E] mt-1 uppercase">
                            {call.location_nome || "Posto Solicitante"}
                          </span>
                        </div>

                        {/* Detail reasons metadata */}
                        <div className="grid grid-cols-2 gap-3 text-[11px] font-mono bg-neutral-50 p-2.5 border border-neutral-200 rounded-sm mt-1">
                          <div>
                            <span className="text-neutral-400 block text-[9px] font-medium leading-none mb-0.5 uppercase">MOTIVO / AJUDA</span>
                            <strong className="text-neutral-800">{call.call_type_nome || "Razão"}</strong>
                          </div>
                          <div>
                            <span className="text-neutral-400 block text-[9px] font-medium leading-none mb-0.5 uppercase">PRIORIDADE</span>
                            <span className={`font-black ${isOpen ? "text-[#EB0A1E] animate-pulse" : "text-amber-600"}`}>
                              {isOpen ? "MAXIMA (P-01)" : "SUPERVISIONADO"}
                            </span>
                          </div>
                        </div>

                        {!isOpen && (
                          <div className="text-[10px] bg-amber-50 border border-amber-200 p-2 font-mono text-amber-800 uppercase tracking-tight">
                            ATRIBUIÇÃO: {call.atendida_por_nome || "Líder"} (Assumido às {new Date(call.atendida_em!).toLocaleTimeString()})
                          </div>
                        )}
                      </div>

                      {/* Interactive Trigger Button actions */}
                      <div className="flex items-center gap-2 border-t border-neutral-100 pt-3 mt-2 font-mono">
                        {isOpen ? (
                          <>
                            {/* Cancel / dismiss */}
                            <button
                              onClick={() => handleCancelCall(call.id)}
                              className="p-2 border-2 border-neutral-300 text-neutral-500 hover:text-black hover:border-black hover:bg-neutral-100 flex items-center justify-center cursor-pointer uppercase font-bold text-xs"
                              title="Rejeitar Chamada"
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                            
                            {/* Assume action trigger */}
                            <button
                              onClick={() => handleAssumeCall(call.id)}
                              className="flex-1 p-2.5 bg-red-600 text-white font-mono font-extrabold uppercase text-xs border-2 border-red-700 tracking-widest text-center transition-all hover:bg-black hover:border-black cursor-pointer shadow-md flex items-center justify-center gap-1.5 active:scale-95"
                            >
                              <Play className="w-4 h-4 text-black bg-white rounded-sm p-0.5" />
                              <span>INICIAR DESLOCAMENTO / ASSUMIR</span>
                            </button>
                          </>
                        ) : (
                          // Complete state resolution
                          <button
                            onClick={() => {
                              stopAndonLoop();
                              setClosingCallId(call.id);
                            }}
                            className="w-full p-2.5 bg-green-600 hover:bg-black text-white hover:text-white font-mono font-extrabold uppercase text-xs border-2 border-green-700 tracking-wider text-center transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-95"
                          >
                            <Check className="w-4 h-4 text-black bg-white p-0.5 rounded-sm" />
                            <span>ENCERRAR INTERVENÇÃO / RESOLVER</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* -------------------------------------------------- */}
        {/* PATH = "/tl/dashboard" (KPI CONTROLLERS AND PLOTS) */}
        {/* -------------------------------------------------- */}
        {currentPath === "/tl/dashboard" && currentUser && (
          <div className="flex flex-col gap-6">
            
            {/* Header tab switcher */}
            <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3 bg-neutral-900 p-2.5 border-2 border-black shadow">
              <div className="flex flex-wrap gap-1.5 font-mono text-xs font-bold uppercase text-white">
                <button 
                  onClick={() => setCurrentPath("/tl/chamadas")}
                  className="p-2.5 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors cursor-pointer flex items-center gap-2"
                >
                  <Activity className="w-4 h-4" />
                  <span>Fila em Tempo Real ({calls.filter(c=>c.estado==="aberta" || c.estado==="em_atendimento").length})</span>
                </button>
                
                <button 
                  onClick={() => setCurrentPath("/tl/dashboard")}
                  className="p-2.5 bg-[#EB0A1E] text-white border border-[#EB0A1E] select-none flex items-center gap-2"
                >
                  <BarChart2 className="w-4 h-4" />
                  <span>PAINEL KPI & ESTATÍSTICAS</span>
                </button>
                
                <button 
                  onClick={() => setCurrentPath("/tl/config")}
                  className="p-2.5 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors cursor-pointer flex items-center gap-2"
                >
                  <Settings className="w-4 h-4" />
                  <span>Configurações & Purge</span>
                </button>
              </div>

              {/* CSV downloader streamer call */}
              <a
                href="/api/export/calls.csv"
                download={`calls_${new Date().toISOString().split("T")[0]}.csv`}
                className="p-2.5 bg-green-600 hover:bg-green-700 text-white font-mono text-xs font-black uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-colors border border-green-700 shrink-0 self-start"
              >
                <Download className="w-4 h-4" />
                <span>EXPORTAR BASE CSV</span>
              </a>
            </div>

            {/* General Overview Metrics row */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 font-mono">
              <div className="bg-white border-2 border-black p-4 flex flex-col justify-between shadow-sm">
                <span className="text-neutral-500 text-[10px] font-bold uppercase tracking-widest block leading-none">TOTAL OCORRÊNCIAS</span>
                <span className="text-4xl font-mono font-black block mt-2 text-black">{liveStats.total}</span>
              </div>
              <div className="bg-white border-2 border-black p-4 flex flex-col justify-between shadow-sm">
                <span className="text-neutral-500 text-[10px] font-bold uppercase tracking-widest block leading-none">RESOLVIDAS (OK)</span>
                <span className="text-4xl font-mono font-black block mt-2 text-green-600">{liveStats.resolvidas}</span>
              </div>
              <div className="bg-white border-2 border-black p-4 flex flex-col justify-between shadow-sm">
                <span className="text-neutral-500 text-[10px] font-bold uppercase tracking-widest block leading-none">CANCELADAS / DESC.</span>
                <span className="text-4xl font-mono font-black block mt-2 text-neutral-400">{liveStats.canceladas}</span>
              </div>
              <div className="bg-white border-2 border-black p-4 flex flex-col justify-between shadow-sm">
                <span className="text-neutral-500 text-[10px] font-bold uppercase tracking-widest block leading-none">MÉDIO TEMP ATENDIMENTO</span>
                <span className="text-2xl font-mono font-black block mt-3.5 text-neutral-900 leading-none">
                  {formatSecsToDurationLabel(liveStats.tempoMedioAtendimento)}
                </span>
              </div>
              <div className="bg-white border-2 border-black p-4 flex flex-col justify-between shadow-sm col-span-2 lg:col-span-1">
                <span className="text-neutral-500 text-[10px] font-bold uppercase tracking-widest block leading-none">MÉDIO TEMP RESOLUÇÃO</span>
                <span className="text-2xl font-mono font-black block mt-3.5 text-[#EB0A1E] leading-none">
                  {formatSecsToDurationLabel(liveStats.tempoMedioResolucao)}
                </span>
              </div>
            </div>

            {/* Recharts Graphical Distribution plots grid */}
            {calls.length === 0 ? (
              <div className="hmi-panel flex flex-col items-center justify-center py-16 text-center text-neutral-400 bg-white">
                <Database className="w-10 h-10 mb-2" />
                <p className="font-mono text-xs uppercase font-semibold">Nenhum dado estatístico disponível no histórico.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* BAR 1: Calls by Operator Name */}
                <div className="hmi-panel bg-white flex flex-col gap-3">
                  <h5 className="font-mono text-xs font-extrabold uppercase tracking-wider text-neutral-700 border-b border-neutral-100 pb-2 flex justify-between items-center">
                    <span>OCORRÊNCIAS POR OPERADOR (TM)</span>
                    <span className="text-[10px] text-neutral-400 font-normal">HISTÓRICO</span>
                  </h5>
                  <div className="h-64 mt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={getCallsByTmData()}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fontFamily: "monospace" }} />
                        <YAxis tick={{ fontSize: 10, fontFamily: "monospace" }} />
                        <Tooltip contentStyle={{ fontFamily: "monospace", fontSize: 11 }} />
                        <Bar dataKey="Chamadas" fill="#EB0A1E" name="Chamadas" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* BAR 2: Calls by Production Station Location */}
                <div className="hmi-panel bg-white flex flex-col gap-3">
                  <h5 className="font-mono text-xs font-extrabold uppercase tracking-wider text-neutral-700 border-b border-neutral-100 pb-2 flex justify-between items-center">
                    <span>OCORRÊNCIAS POR POSTO LOCAL (LINHA)</span>
                    <span className="text-[10px] text-neutral-400 font-normal">TOP 8 POSTOS</span>
                  </h5>
                  <div className="h-64 mt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={getCallsByLocationData()}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="name" tick={{ fontSize: 9, fontFamily: "monospace" }} />
                        <YAxis tick={{ fontSize: 10, fontFamily: "monospace" }} />
                        <Tooltip contentStyle={{ fontFamily: "monospace", fontSize: 11 }} />
                        <Bar dataKey="Chamadas" fill="#18181b" name="Chamadas" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* BAR 3: Ocular distribution causes classifications */}
                <div className="hmi-panel bg-white flex flex-col gap-3">
                  <h5 className="font-mono text-xs font-extrabold uppercase tracking-wider text-neutral-700 border-b border-neutral-100 pb-2 flex justify-between items-center">
                    <span>ANÁLISE DE CAUSA RAIZ (PARETO REASONS)</span>
                    <span className="text-[10px] text-neutral-400 font-normal">CLASSIFICAÇÃO</span>
                  </h5>
                  <div className="h-64 mt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={getCallsByReasonData()}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fontFamily: "monospace" }} />
                        <YAxis tick={{ fontSize: 10, fontFamily: "monospace" }} />
                        <Tooltip contentStyle={{ fontFamily: "monospace", fontSize: 11 }} />
                        <Bar dataKey="Quantidade" fill="#ca8a04" name="Contagem" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* PIE 4: States Overview */}
                <div className="hmi-panel bg-white flex flex-col gap-3">
                  <h5 className="font-mono text-xs font-extrabold uppercase tracking-wider text-neutral-700 border-b border-neutral-100 pb-2 flex justify-between items-center">
                    <span>OCUPAÇÃO GERAL EM PERCENTAGEM DE ESTADOS</span>
                    <span className="text-[10px] text-neutral-400 font-normal">DISTRIBUIÇÃO</span>
                  </h5>
                  <div className="h-64 relative flex items-center justify-center">
                    <div className="w-full h-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={getCallsByStateData()}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {getCallsByStateData().map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Legend wrapperStyle={{ fontFamily: "monospace", fontSize: 11 }} />
                          <Tooltip contentStyle={{ fontFamily: "monospace", fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* Chronological State audits listing log */}
            <div className="hmi-panel bg-white flex flex-col gap-4">
              <div className="border-b-2 border-black pb-3">
                <h4 className="text-md font-mono font-extrabold uppercase tracking-tight text-neutral-900 flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Rastreabilidade Completa: Logs de Auditoria do Sistema
                </h4>
                <p className="text-xs text-neutral-500 font-mono mt-1">
                  Registros gerados por gatilhos de transições de estado (Trigger Log Simulation: <code className="text-red-650 bg-neutral-100 px-1 py-0.5 rounded-sm font-bold">log_call_state_change</code>) para integridade regulatória TPS.
                </p>
              </div>

              {auditLog.length === 0 ? (
                <div className="py-6 text-center text-neutral-400 text-xs font-mono uppercase">
                  Nenhuma transição de estado registrada.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-mono text-xs uppercase border-collapse">
                    <thead>
                      <tr className="bg-neutral-900 text-white border-2 border-black font-extrabold select-none">
                        <th className="p-2.5">Data/Hora</th>
                        <th className="p-2.5">Chamado ID</th>
                        <th className="p-2.5">De Ecrã</th>
                        <th className="p-2.5">Para Estado</th>
                        <th className="p-2.5">Autor/Ato</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200">
                      {auditLog.slice(0, 15).map((log) => (
                        <tr key={log.id} className="hover:bg-neutral-50">
                          <td className="p-2.5 text-neutral-500 font-normal">
                            {new Date(log.criado_em).toLocaleString()}
                          </td>
                          <td className="p-2.5 font-bold text-neutral-900">{log.call_id}</td>
                          <td className="p-2.5">
                            <span className="text-neutral-400 font-bold">{log.de_estado ? log.de_estado.toUpperCase() : "NULL (INSERT)"}</span>
                          </td>
                          <td className="p-2.5">
                            <span className={`p-1 font-extrabold ${
                              log.para_estado === "aberta" ? "text-red-600 bg-red-50" :
                              log.para_estado === "em_atendimento" ? "text-amber-600 bg-amber-50" :
                              log.para_estado === "resolvida" ? "text-green-600 bg-green-50" :
                              "text-neutral-500 bg-neutral-100"
                            }`}>
                              {log.para_estado.toUpperCase()}
                            </span>
                          </td>
                          <td className="p-2.5 text-neutral-700 font-semibold">{log.ator_nome || log.ator_id || "Sistema"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            
          </div>
        )}

        {/* -------------------------------------------------- */}
        {/* PATH = "/tl/config" (CONFIGS CONTROLLERS LISTS) */}
        {/* -------------------------------------------------- */}
        {currentPath === "/tl/config" && currentUser && (
          <div className="flex flex-col gap-6">
            
            {/* Nav switcher */}
            <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3 bg-neutral-900 p-2.5 border-2 border-black shadow">
              <div className="flex flex-wrap gap-1.5 font-mono text-xs font-bold uppercase text-white">
                <button 
                  onClick={() => setCurrentPath("/tl/chamadas")}
                  className="p-2.5 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors cursor-pointer flex items-center gap-2"
                >
                  <Activity className="w-4 h-4" />
                  <span>Fila em Tempo Real ({calls.filter(c=>c.estado==="aberta" || c.estado==="em_atendimento").length})</span>
                </button>
                
                <button 
                  onClick={() => setCurrentPath("/tl/dashboard")}
                  className="p-2.5 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors cursor-pointer flex items-center gap-2"
                >
                  <BarChart2 className="w-4 h-4" />
                  <span>Painel KPI & Estatísticas</span>
                </button>
                
                <button 
                  onClick={() => setCurrentPath("/tl/config")}
                  className="p-2.5 bg-[#EB0A1E] text-white border border-[#EB0A1E] select-none flex items-center gap-2"
                >
                  <Settings className="w-4 h-4" />
                  <span>CONFIGURAÇÕES & PURGE</span>
                </button>
              </div>

              {/* Reset system purging and clearing */}
              <button
                onClick={handleSystemPurgeReset}
                className="p-2.5 bg-red-600 hover:bg-black text-white hover:text-red-200 font-mono text-xs font-black uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-colors border border-red-700 shrink-0 self-start"
              >
                <Trash className="w-4 h-4" />
                <span>LIMPAR DADOS HISTÓRICOS</span>
              </button>
            </div>

            {/* Forms grid logic editor */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* STATIONS LOCATIONS EDITOR */}
              <div className="hmi-panel bg-white flex flex-col gap-4">
                <div className="border-b border-neutral-200 pb-2">
                  <h4 className="text-sm font-mono font-bold uppercase tracking-tight text-neutral-900">
                    🗂️ GERIR POSTOS DE TRABALHO (LOCATIONS)
                  </h4>
                  <span className="text-[10px] text-neutral-400 font-mono">ADICIONAR OU DESATIVAR CANAIS DE PRODUÇÃO</span>
                </div>

                {/* Insertion Form */}
                <form onSubmit={handleAddLocation} className="flex gap-2 font-mono text-xs">
                  <input
                    type="text"
                    value={newLocationName}
                    onChange={(e) => setNewLocationName(e.target.value)}
                    placeholder="Ex: Posto 04 · Fim de Linha"
                    disabled={loadingConfig}
                    required
                    className="flex-1 p-2 border-2 border-neutral-800 focus:border-red-600 focus:outline-none bg-neutral-50 text-neutral-900 font-bold"
                  />
                  <button
                    type="submit"
                    disabled={loadingConfig || !newLocationName.trim()}
                    className="p-2 px-4 bg-neutral-900 text-white font-bold uppercase border-2 border-black hover:bg-red-600 hover:border-black cursor-pointer transition-colors shrink-0 disabled:opacity-50"
                  >
                    + ADICIONAR
                  </button>
                </form>

                {/* Items listings */}
                <div className="flex flex-col border border-neutral-200 divide-y divide-neutral-200 font-mono text-xs uppercase max-h-80 overflow-y-auto">
                  {locations.map((loc) => {
                    const isReferencedInCalls = calls.some(c => c.location_id === loc.id);
                    return (
                      <div key={loc.id} className="p-2 flex justify-between items-center bg-white hover:bg-neutral-50">
                        <span className={loc.ativo ? "text-neutral-900 font-bold" : "text-neutral-400 line-through"}>
                          {loc.nome}
                        </span>
                        
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Active Slider toggle */}
                          <button
                            onClick={() => handleToggleLocation(loc.id)}
                            className="p-1 hover:bg-neutral-200 transition-colors cursor-pointer text-neutral-700"
                            title={loc.ativo ? "Desativar Posto" : "Re-Ativar Posto"}
                          >
                            {loc.ativo ? (
                              <ToggleRight className="w-5.5 h-5.5 text-green-600" />
                            ) : (
                              <ToggleLeft className="w-5.5 h-5.5 text-neutral-400" />
                            )}
                          </button>

                          {/* Delete check */}
                          <button
                            onClick={() => handleDeleteLocation(loc.id)}
                            disabled={isReferencedInCalls}
                            className={`p-1.5 transition-colors cursor-pointer border rounded-sm ${
                              isReferencedInCalls 
                                ? "text-neutral-300 border-neutral-100 bg-neutral-50 cursor-not-allowed" 
                                : "text-red-600 border-neutral-200 bg-white hover:bg-red-50 hover:border-red-400"
                            }`}
                            title={isReferencedInCalls ? "Este posto não pode ser deletado porque possui histórico associado." : "Deletar Posto"}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* CALL TYPES EDITOR */}
              <div className="hmi-panel bg-white flex flex-col gap-4">
                <div className="border-b border-neutral-200 pb-2">
                  <h4 className="text-sm font-mono font-bold uppercase tracking-tight text-neutral-900">
                    🗂️ GERIR TIPOS DE CHAMADA (CALL_TYPES)
                  </h4>
                  <span className="text-[10px] text-neutral-400 font-mono">CONFIGURAR CLASSIFICAÇÕES DE MOTIVOS</span>
                </div>

                {/* Insertion Form */}
                <form onSubmit={handleAddCallType} className="flex gap-2 font-mono text-xs">
                  <input
                    type="text"
                    value={newCallTypeName}
                    onChange={(e) => setNewCallTypeName(e.target.value)}
                    placeholder="Ex: Falha de Componente"
                    disabled={loadingConfig}
                    required
                    className="flex-1 p-2 border-2 border-neutral-800 focus:border-red-600 focus:outline-none bg-neutral-50 text-neutral-900 font-bold"
                  />
                  <button
                    type="submit"
                    disabled={loadingConfig || !newCallTypeName.trim()}
                    className="p-2 px-4 bg-neutral-900 text-white font-bold uppercase border-2 border-black hover:bg-red-600 hover:border-black cursor-pointer transition-colors shrink-0 disabled:opacity-50"
                  >
                    + ADICIONAR
                  </button>
                </form>

                {/* Items listings */}
                <div className="flex flex-col border border-neutral-200 divide-y divide-neutral-200 font-mono text-xs uppercase max-h-80 overflow-y-auto">
                  {callTypes.map((type) => {
                    const isReferencedInCalls = calls.some(c => c.call_type_id === type.id);
                    return (
                      <div key={type.id} className="p-2 flex justify-between items-center bg-white hover:bg-neutral-50">
                        <span className={type.ativo ? "text-neutral-900 font-bold" : "text-neutral-400 line-through"}>
                          {type.nome}
                        </span>

                        <div className="flex items-center gap-2 shrink-0">
                          {/* Active Toggle toggle */}
                          <button
                            onClick={() => handleToggleCallType(type.id)}
                            className="p-1 hover:bg-neutral-200 transition-colors cursor-pointer text-neutral-700"
                            title={type.ativo ? "Desativar Tipo" : "Re-Ativar Tipo"}
                          >
                            {type.ativo ? (
                              <ToggleRight className="w-5.5 h-5.5 text-green-600" />
                            ) : (
                              <ToggleLeft className="w-5.5 h-5.5 text-neutral-400" />
                            )}
                          </button>

                          {/* Delete checker */}
                          <button
                            onClick={() => handleDeleteCallType(type.id)}
                            disabled={isReferencedInCalls}
                            className={`p-1.5 transition-colors cursor-pointer border rounded-sm ${
                              isReferencedInCalls 
                                ? "text-neutral-300 border-neutral-100 bg-neutral-50 cursor-not-allowed" 
                                : "text-red-600 border-neutral-200 bg-white hover:bg-red-50 hover:border-red-400"
                            }`}
                            title={isReferencedInCalls ? "Este motivo possui chamadas históricas vinculadas." : "Deletar Tipo"}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* OPERATORS AND NFC CARD REGISTRATION */}
              <div className="hmi-panel bg-white flex flex-col gap-4 col-span-1 md:col-span-2">
                <div className="border-b-2 border-black pb-2 flex justify-between items-center">
                  <div>
                    <h4 className="text-sm font-mono font-black uppercase tracking-tight text-neutral-900 flex items-center gap-1.5 font-bold">
                      👤 GERIR COLABORADORES E CARTÕES NFC
                    </h4>
                    <span className="text-[10px] text-neutral-400 font-mono">CADASTRO DE OPERADORES (TM) E LÍDERES (TL) COM AUTO-NORMALIZAÇÃO DE UID NFC</span>
                  </div>
                  <span className="p-1 px-2 text-[9px] bg-red-100 text-[#EB0A1E] font-mono font-bold uppercase rounded border border-red-200 select-none">
                    NFC {('NDEFReader' in window) ? "SENSOR DISPONÍVEL" : "EMULADO"}
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left Column: Form to create new user */}
                  <form onSubmit={handleCreateOperator} className="flex flex-col gap-3 font-mono text-xs border border-neutral-200 p-4 bg-neutral-50 rounded-sm lg:col-span-1">
                    <h5 className="font-bold text-neutral-900 uppercase border-b border-neutral-300 pb-1.5 mb-1">
                      Novo Operador
                    </h5>
                    
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-neutral-500 font-bold uppercase">Nome do Colaborador *</label>
                      <input
                        type="text"
                        value={newOpNome}
                        onChange={(e) => setNewOpNome(e.target.value)}
                        placeholder="Ex: Carlos Santos (TM4)"
                        required
                        className="p-2 border-2 border-neutral-800 focus:border-red-650 bg-white text-neutral-900 font-bold uppercase"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-neutral-500 font-bold uppercase">Email (Opcional)</label>
                      <input
                        type="email"
                        value={newOpEmail}
                        onChange={(e) => setNewOpEmail(e.target.value)}
                        placeholder="Ex: carlos.santos@toyota.pt"
                        className="p-2 border-2 border-neutral-800 focus:border-red-650 bg-white"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-neutral-500 font-bold uppercase">Função de Fábrica</label>
                      <select
                        value={newOpRole}
                        onChange={(e: any) => setNewOpRole(e.target.value)}
                        className="p-2 border-2 border-neutral-800 focus:border-red-650 bg-white text-neutral-900 font-bold uppercase"
                      >
                        <option value="team_member">Team Member (Operador)</option>
                        <option value="team_leader">Team Leader (Supervisor)</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-neutral-500 font-bold uppercase">Número de Série (NFC UID)</label>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={newOpNfcUid}
                          onChange={(e) => setNewOpNfcUid(e.target.value)}
                          placeholder="Físico ou clique em ler"
                          className="flex-1 p-2 border-2 border-neutral-800 bg-white font-mono text-xs uppercase"
                        />
                        <button
                          type="button"
                          onClick={() => startNfcSession("new")}
                          className="p-2 bg-[#EB0A1E] hover:bg-black text-white font-bold text-[10px] uppercase cursor-pointer shrink-0 border-2 border-neutral-900 shadow-sm font-black"
                          title="Ler aproximação física do cartão de telecom"
                        >
                          📡 Ler
                        </button>
                      </div>
                      <span className="text-[9px] text-neutral-400 font-bold">Pode preencher manualmente ou premir "Ler" para aproximar o cartão.</span>
                    </div>

                    <button
                      type="submit"
                      disabled={loadingConfig || !newOpNome.trim()}
                      className="mt-2 w-full p-2.5 bg-neutral-900 hover:bg-[#EB0A1E] text-white font-bold uppercase border-2 border-black transition-colors cursor-pointer text-center font-black"
                    >
                      ✓ SALVAR UTILIZADOR
                    </button>
                  </form>

                  {/* Right Column: Listing of operators */}
                  <div className="lg:col-span-2 flex flex-col gap-2">
                    <h5 className="font-mono text-xs font-bold text-neutral-900 uppercase">
                      Colaboradores Ativos ({operators.length})
                    </h5>

                    <div className="flex flex-col border border-neutral-200 divide-y divide-neutral-200 font-mono text-xs max-h-96 overflow-y-auto rounded-sm bg-white shadow-sm">
                      {operators.length === 0 ? (
                        <div className="p-8 text-center text-neutral-400 font-mono text-[11px] uppercase">
                          Sincronizando operadores cadastrados...
                        </div>
                      ) : (
                        operators.map((op) => {
                          const isTleader = op.role === "team_leader";
                          return (
                            <div key={op.id} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white hover:bg-neutral-50 transition-colors">
                              <div className="flex items-start gap-2.5">
                                <span className={`p-1.5 text-[9px] font-black uppercase rounded shrink-0 border ${
                                  isTleader 
                                    ? "bg-neutral-900 text-white border-neutral-950 font-bold" 
                                    : "bg-red-50 text-red-600 border-red-200 font-bold"
                                }`}>
                                  {isTleader ? "Leader (TL)" : "Member (TM)"}
                                </span>
                                <div>
                                  <div className="font-bold text-neutral-900 uppercase">
                                    {op.nome}
                                  </div>
                                  <div className="text-[10px] text-neutral-400 font-normal">
                                    {op.email || "Sem email cadastrado"}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                                <div className="flex flex-col items-end text-[10px] pr-2 border-r border-neutral-200">
                                  <span className="text-[9px] text-neutral-400 uppercase font-bold leading-none select-none">CARTÃO UID</span>
                                  {op.nfc_uid ? (
                                    <span className="font-mono font-bold text-neutral-950 uppercase mt-1 bg-neutral-100 p-0.5 px-1.5 border border-neutral-300 rounded-sm">
                                      {op.nfc_uid}
                                    </span>
                                  ) : (
                                    <span className="font-mono text-neutral-300 italic uppercase mt-1">
                                      Nenhum
                                    </span>
                                  )}
                                </div>

                                <button
                                  type="button"
                                  onClick={() => startNfcSession(op.id)}
                                  className="p-1 px-2 border border-neutral-300 hover:border-[#EB0A1E] hover:bg-red-50 text-[10px] text-neutral-700 hover:text-red-700 font-bold uppercase transition-all cursor-pointer rounded-sm"
                                  title="Aproximar cartão para vincular a este colaborador"
                                >
                                  📡 Ler Novo Cartão
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleDeleteOperator(op.id, op.nome)}
                                  disabled={op.nfc_uid?.toUpperCase() === "74:EA:91:10"}
                                  className={`p-1.5 transition-colors cursor-pointer border rounded-sm ${
                                    op.nfc_uid?.toUpperCase() === "74:EA:91:10"
                                      ? "text-neutral-300 border-neutral-150 bg-neutral-50 cursor-not-allowed"
                                      : "text-red-650 border-neutral-200 bg-white hover:bg-red-50 hover:border-red-400"
                                  }`}
                                  title={op.nfc_uid?.toUpperCase() === "74:EA:91:10" ? "O Administrador Master Principal não pode ser excluído." : "Excluir colaborador"}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Architectural database schema inspector info screen */}
            <div className="hmi-panel-dark bg-zinc-900 text-zinc-300 font-mono text-xs flex flex-col gap-4">
              <div className="border-b border-zinc-800 pb-2 flex justify-between items-center">
                <h5 className="text-zinc-100 font-extrabold flex items-center gap-2 text-sm uppercase text-red-500">
                  <Database className="w-4 h-4 text-white" />
                  MIGRAÇÕES SUPABASE POSTGRESQL PARA INSTABILIZAÇÃO EM PRODUÇÃO
                </h5>
                <span className="text-[10px] text-zinc-500 bg-zinc-950 p-1 font-bold rounded-sm border border-zinc-900 font-mono select-none">
                  INTEGRIDADE RLS PRO
                </span>
              </div>

              <p className="text-zinc-400 text-[11px] leading-relaxed select-all">
                Este sistema foi modelado de forma idempotente para ser transparente com o banco de dados oficial do Supabase PostgreSQL. Você poderá rodar as migrações criadas para deploy ou verificar a política de RLS em produção. Os logs e tabelas refletem estas transações de forma idêntica.
              </p>

              <div className="p-3.5 bg-zinc-950 border border-zinc-800 text-zinc-400 font-mono overflow-x-auto text-[10px] max-h-48 rounded-sm select-all whitespace-pre leading-normal">
{`-- SQL DEFINITIONS CREATED BY THE DEPLOYMENT
CREATE TYPE public.app_role AS ENUM ('admin', 'team_leader', 'team_member');
CREATE TYPE public.call_state AS ENUM ('aberta', 'em_atendimento', 'resolvida', 'cancelada');

-- Enable RLS for complete professional lock down
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "calls_select_own_or_tl" ON public.calls FOR SELECT TO authenticated
USING (team_member_id = auth.uid() OR public.has_role(auth.uid(), 'team_leader'));`}
              </div>
            </div>

          </div>
        )}

        {/* -------------------------------------------------- */}
        {/* PATH = "/tv" (DEDICATED TV / ANDON MONITOR VIEW)   */}
        {/* -------------------------------------------------- */}
        {currentPath === "/tv" && (
          <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto">
            
            {/* Quick Header Navigation for the TV view (discreetly placed) */}
            <div className="flex justify-between items-center bg-zinc-950 p-4 border-2 border-white/10 shadow-lg text-white font-mono text-xs rounded-sm">
              <button 
                onClick={() => {
                  stopAndonLoop();
                  setCurrentPath("/");
                }}
                className="px-4 py-2 bg-zinc-900 hover:bg-neutral-800 text-neutral-300 hover:text-white transition-colors flex items-center gap-1.5 border border-neutral-800 cursor-pointer text-xs font-bold font-mono"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao Menu
              </button>
              
              <div className="flex items-center gap-4">
                <span className="hidden sm:inline text-zinc-500 uppercase font-extrabold tracking-widest text-[10px]">MONITOR DE TRANSMISSÃO LOGÍSTICA (TV)</span>
                
                {/* Local audio control for TV */}
                <button
                  onClick={handleAudioToggle}
                  className={`px-4 py-2 text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 border-2 ${
                    audioMuted 
                      ? "bg-red-600 border-red-800 text-white animate-pulse" 
                      : "bg-emerald-950 text-emerald-400 border-emerald-800 hover:bg-emerald-900"
                  }`}
                  title={audioMuted ? "Ativar Alertas Sonoros" : "Silenciar Alertas Sonoros"}
                >
                  {audioMuted ? <VolumeX className="w-4 h-4 animate-bounce" /> : <Volume2 className="w-4 h-4" />}
                  <span>{audioMuted ? "VOLUME: MUTADO - CLIQUE PARA ATIVAR" : "VOLUME: MONITOR ATIVO 🔊"}</span>
                </button>
              </div>
            </div>

            {/* Main TV Screen: HUGE industrial layout */}
            {(() => {
              const activeCalls = calls.filter(c => c.estado === "aberta" || c.estado === "em_atendimento");
              const openCalls = activeCalls.filter(c => c.estado === "aberta");
              const runningCalls = activeCalls.filter(c => c.estado === "em_atendimento");

              return (
                <div className="flex flex-col gap-6">
                  
                  {/* Big indicator bar based on status status indicator */}
                  {openCalls.length > 0 ? (
                    <div className="bg-red-600 text-white p-8 border-4 border-red-800 flex flex-col items-center justify-center text-center gap-3 font-mono shadow-2xl animate-pulse">
                      <span className="text-3xl lg:text-5xl font-black tracking-widest leading-tight block">⚠️ CHAMADA REQUERIDA (ANDON ATIVO) ⚠️</span>
                      <span className="text-sm lg:text-lg font-bold opacity-90 uppercase tracking-widest bg-black/40 px-4 py-1">
                        {openCalls.length} POSTO(S) AGUARDANDO ATENDIMENTO COM SIRENE EM CURSO
                      </span>
                    </div>
                  ) : runningCalls.length > 0 ? (
                    <div className="bg-amber-500 text-black p-8 border-4 border-amber-600 flex flex-col items-center justify-center text-center gap-2 font-mono shadow-xl">
                      <span className="text-2xl lg:text-4xl font-black tracking-widest leading-none">🚧 ATENDIMENTO EM EXECUÇÃO 🚧</span>
                      <span className="text-xs lg:text-sm font-bold uppercase tracking-widest bg-black/10 px-3 py-1 mt-1">
                        Supervisor alertado e em deslocamento presencial
                      </span>
                    </div>
                  ) : (
                    <div className="bg-emerald-600 text-white p-10 border-4 border-emerald-800 flex flex-col items-center justify-center text-center gap-4 font-mono shadow-lg">
                      <div className="w-20 h-20 rounded-full bg-emerald-800/30 flex items-center justify-center border-4 border-white animate-bounce">
                        <Check className="w-12 h-12 text-white" strokeWidth={4} />
                      </div>
                      <div>
                        <span className="text-3xl lg:text-5xl font-black tracking-widest leading-none block uppercase">LINHA OPERANDO SEGURO</span>
                        <p className="text-xs lg:text-sm font-bold opacity-90 mt-2.5 uppercase tracking-widest text-emerald-200">ESTABILIDADE DO POSTO: ESTÁVEL · NENHUM ALERTA EM CURSO</p>
                      </div>
                    </div>
                  )}

                  {/* Operational statistical dashboards optimized for readability at 10 meters */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 font-mono text-center">
                    <div className="bg-zinc-950 text-zinc-100 p-6 border-2 border-zinc-900 flex flex-col justify-center items-center shadow-md">
                      <span className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">RELÓGIO ATIVO LINHA</span>
                      <span className="text-4xl font-extrabold text-zinc-100 mt-2 select-none tracking-wider">
                        {new Date().toLocaleTimeString('pt-BR')}
                      </span>
                    </div>
                    <div className="bg-zinc-950 text-zinc-100 p-6 border-2 border-zinc-900 flex flex-col justify-center items-center shadow-md">
                      <span className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">SOLICITAÇÕES NA FILA</span>
                      <span className={`text-5xl font-black mt-1 ${openCalls.length > 0 ? "text-red-500 animate-pulse" : "text-zinc-400"}`}>
                        {openCalls.length}
                      </span>
                    </div>
                    <div className="bg-zinc-950 text-zinc-100 p-6 border-2 border-zinc-900 flex flex-col justify-center items-center shadow-md">
                      <span className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">TEMPO MÉDIO RESPOSTA</span>
                      <span className="text-4xl font-black text-amber-500 mt-1">
                        {formatSecsToDurationLabel(liveStats.tempoMedioAtendimento)}
                      </span>
                    </div>
                  </div>

                  {/* Live alerts layout cards */}
                  {activeCalls.length === 0 ? (
                    <div className="bg-white border-2 border-dashed border-neutral-300 rounded p-16 text-center text-neutral-400 font-mono flex flex-col items-center justify-center gap-4 shadow-sm">
                      <Activity className="w-14 h-14 text-neutral-300 animate-pulse" />
                      <div>
                        <p className="text-xs uppercase font-extrabold tracking-widest text-neutral-500">Fluxo logístico sob supervisão contínua</p>
                        <p className="text-[10px] text-neutral-400 mt-1">Todos os 4 postos de trabalho operando em estabilidade</p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2">
                      {activeCalls.map((call) => {
                        const isOpen = call.estado === "aberta";
                        return (
                          <div 
                            key={call.id} 
                            className={`border-4 bg-white flex flex-col justify-between relative overflow-hidden transition-all shadow-xl ${
                              isOpen 
                                ? "border-red-600 ring-4 ring-red-500/10" 
                                : "border-yellow-500"
                            }`}
                          >
                            {/* Hazard tape design decorator */}
                            <div className={`${isOpen ? "hazard-tape-thin-red" : "hazard-tape-thin"} h-5`}></div>

                            <div className="p-8 flex flex-col justify-between flex-1">
                              
                              {/* Header metrics details */}
                              <div className="flex justify-between items-center border-b-2 border-neutral-100 pb-4">
                                <div className="flex items-center gap-3">
                                  <span className="font-mono text-base font-black bg-zinc-950 text-white px-3.5 py-1 uppercase tracking-wider">
                                    {call.id}
                                  </span>
                                  <span className="text-xs font-bold font-mono text-neutral-400 uppercase">
                                    Disparado às {new Date(call.aberta_em).toLocaleTimeString('pt-BR')}
                                  </span>
                                </div>
                                <span className={`text-xs font-black font-mono uppercase px-3 py-1 border-2 ${
                                  isOpen 
                                    ? "text-red-650 border-red-600 animate-pulse bg-red-50/50" 
                                    : "text-amber-600 border-amber-500 bg-amber-50/50"
                                }`}>
                                  {isOpen ? "🚨 EM FILA · AGUARDANDO TL" : "🚧 EM ATENDIMENTO"}
                                </span>
                              </div>

                              {/* Big Display Content text tailored for TVs */}
                              <div className="my-8 flex flex-col gap-6">
                                <div className="flex flex-col">
                                  <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest font-extrabold leading-none">POSTO DE MONTAGEM SOLICITANTE</span>
                                  <span className={`text-4xl lg:text-5xl font-black font-mono tracking-tight uppercase mt-2 ${isOpen ? "text-red-600 animate-pulse" : "text-black"}`}>
                                    {call.location_nome || "Posto Solicitante"}
                                  </span>
                                </div>

                                <div className="flex flex-col">
                                  <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest font-extrabold leading-none">MOTIVO DA PARAGEM / AJUDA</span>
                                  <span className="text-2xl lg:text-3xl font-bold font-mono text-neutral-800 uppercase mt-2">
                                    {call.call_type_nome || "Razão do Alerta"}
                                  </span>
                                </div>

                                {/* Large elapsed stopwatch for industrial timing */}
                                <div className="grid grid-cols-2 gap-4 text-xs font-mono bg-zinc-950 text-white p-5 border border-zinc-900 rounded-sm">
                                  <div>
                                    <span className="text-zinc-500 block text-[9px] font-black uppercase tracking-widest">TEMPO ELAPSO</span>
                                    <span className={`text-3xl font-black mt-1.5 block tracking-widest font-mono ${isOpen ? "text-red-500" : "text-amber-500"}`}>
                                      {formatStopWatch(call.aberta_em)}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-zinc-500 block text-[9px] font-black uppercase tracking-widest">TEAM LEADER ATRIBUÍDO</span>
                                    <span className="text-sm font-black text-zinc-100 mt-3 block uppercase truncate leading-none">
                                      {isOpen ? "[AGUARDANDO SUPERVISOR]" : (call.atendida_por_nome || "Supervisor")}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Card footer details for integrity verification */}
                              <div className="pt-3 border-t border-neutral-150 flex items-center justify-between font-mono text-[10px]">
                                <span className="text-neutral-400 font-extrabold">CRAFTED FOR TOYOTA ANDON TELEMETRY</span>
                                <span className="text-zinc-650 font-black">SOLICITADO POR: {call.team_member_nome || "Operador"}</span>
                              </div>

                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                </div>
              );
            })()}

          </div>
        )}

      </main>

      {/* Dynamic NFC Scanning / Simulation Overlay Modal */}
      {isNfcScannerActive && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-neutral-900 border-2 border-red-600 text-white p-6 max-w-sm w-full rounded-sm shadow-2xl flex flex-col gap-4 font-mono text-xs relative">
            <div className="border-b border-neutral-800 pb-2">
              <h4 className="text-sm font-black text-red-500 uppercase tracking-widest flex items-center gap-2">
                📡 AGUARDANDO LEITURA NFC
              </h4>
              <p className="text-[10px] text-neutral-400 mt-1 uppercase">
                {nfcScannerStatus}
              </p>
            </div>

            {/* Pulsing Visual Wave */}
            <div className="flex justify-center my-4">
              <div className="relative flex items-center justify-center">
                <span className="animate-ping absolute inline-flex h-12 w-12 rounded-full bg-red-600 opacity-35"></span>
                <div className="w-16 h-16 bg-neutral-950 border border-neutral-800 text-white flex items-center justify-center rounded-full shadow">
                  <Database className="w-8 h-8 text-red-500" />
                </div>
              </div>
            </div>

            {/* Quick Simulation Input */}
            <div className="bg-neutral-950 p-3 border border-neutral-800 flex flex-col gap-2 rounded-sm">
              <label htmlFor="modal-simulated-uid" className="text-[9px] uppercase tracking-wider text-neutral-400 font-bold block">
                Simulador de Proximidade (Escreva o UID)
              </label>
              
              <div className="flex gap-2">
                <input
                  type="text"
                  id="modal-simulated-uid"
                  placeholder="Ex: 74:EA:91:10"
                  className="flex-1 p-2 bg-neutral-950 border border-neutral-700 text-white font-mono text-xs focus:outline-none focus:border-red-500 uppercase"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const val = (e.target as HTMLInputElement).value;
                      if (val) {
                        setIsNfcScannerActive(false);
                        if (opScanningId) {
                          if (opScanningId === "new") {
                            setNewOpNfcUid(val);
                          } else {
                            handleUpdateOperatorCard(opScanningId, val);
                          }
                        } else {
                          handleNfcAuthentic(val);
                        }
                      }
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const val = (document.getElementById("modal-simulated-uid") as HTMLInputElement)?.value;
                    if (val) {
                      setIsNfcScannerActive(false);
                      if (opScanningId) {
                        if (opScanningId === "new") {
                          setNewOpNfcUid(val);
                        } else {
                          handleUpdateOperatorCard(opScanningId, val);
                        }
                      } else {
                        handleNfcAuthentic(val);
                      }
                    }
                  }}
                  className="p-2 px-3 bg-red-600 hover:bg-neutral-800 text-white font-bold cursor-pointer transition-colors text-[10px] uppercase border border-red-500 hover:border-black shrink-0"
                >
                  Ler
                </button>
              </div>
            </div>

            {/* Cancellation Button */}
            <button
              onClick={cancelNfcSession}
              className="w-full p-2.5 bg-neutral-800 hover:bg-neutral-700 text-white font-bold uppercase transition-colors cursor-pointer border border-neutral-700 text-center"
            >
              Cancelar Leitura
            </button>
          </div>
        </div>
      )}

      {/* Persistent download layout indicator */}
      <InstallPrompt />
    </div>
  );
}
