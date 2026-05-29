import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

// Types corresponding to src/types.ts
import { AppRole, CallState, Profile, UserRole, Location, CallType, Call, AuditLog } from "./src/types";
import { TEAM_MEMBERS, TM_SHARED_PASSWORD, DEFAULT_LOCATIONS, DEFAULT_CALL_TYPES } from "./src/lib/constants";

const app = express();
const PORT = 3000;
const DB_FILE = path.join(process.cwd(), "data-store.json");

// Parse request bodies
app.use(express.json());

// List of connected SSE clients
let sseClients: express.Response[] = [];

// Helper to broadcast changes to all SSE clients
function broadcast(event: string, payload: any) {
  const data = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
  sseClients.forEach((client) => {
    try {
      client.write(`data: ${data}\n\n`);
    } catch (err) {
      // Clean up failed streams in transmission
    }
  });
}

// Ensure Database structure
interface DB {
  profiles: Profile[];
  user_roles: UserRole[];
  locations: Location[];
  call_types: CallType[];
  calls: Call[];
  audit_log: AuditLog[];
}

// NFC UID Matching Utilities
function normalizeNfcUid(uid: string): string {
  return uid.toLowerCase().replace(/[^a-f0-9]/g, "");
}

function matchNfcUid(uidA: string, uidB: string): boolean {
  if (!uidA || !uidB) return false;
  const normA = normalizeNfcUid(uidA);
  const normB = normalizeNfcUid(uidB);
  
  if (normA === normB) return true;
  
  // Reversal comparison check (in case NFC reader scans bytes backward)
  if (normA.length % 2 === 0) {
    const bytes: string[] = [];
    for (let i = 0; i < normA.length; i += 2) {
      bytes.push(normA.substring(i, i + 2));
    }
    const reversedNormA = bytes.reverse().join("");
    if (reversedNormA === normB) return true;
  }
  
  return false;
}

function createInitialDB(): DB {
  return {
    profiles: [],
    user_roles: [],
    locations: DEFAULT_LOCATIONS.map((loc, index) => ({
      id: `loc-${index + 1}`,
      nome: loc.nome,
      ordem: loc.ordem,
      ativo: true,
      criado_em: new Date().toISOString(),
    })),
    call_types: DEFAULT_CALL_TYPES.map((type, index) => ({
      id: `ct-${index + 1}`,
      nome: type.nome,
      ordem: type.ordem,
      ativo: true,
      criado_em: new Date().toISOString(),
    })),
    calls: [],
    audit_log: [],
  };
}

function loadDB(): DB {
  let loadedDB: DB;
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, "utf-8");
      loadedDB = JSON.parse(content);
    } else {
      loadedDB = createInitialDB();
    }
  } catch (err) {
    console.error("Database read error, recreating database...", err);
    loadedDB = createInitialDB();
  }

  // Ensure our designated Team Leader / Admin Profile always exists with NFC UID "74:EA:91:10"
  const tlAdminEmail = "super.lider@toyota-ovar.local";
  let hasTlAdmin = loadedDB.profiles.some(p => p.nfc_uid && matchNfcUid(p.nfc_uid, "74:EA:91:10"));
  if (!hasTlAdmin) {
    const adminProfileExist = loadedDB.profiles.find(p => p.email === tlAdminEmail);
    if (adminProfileExist) {
      adminProfileExist.nfc_uid = "74:EA:91:10";
    } else {
      const adminId = "tl-toyota-admin";
      loadedDB.profiles.push({
        id: adminId,
        nome: "Team Leader Toyota",
        email: tlAdminEmail,
        nfc_uid: "74:EA:91:10",
        ativo: true,
        criado_em: new Date().toISOString()
      });
      if (!loadedDB.user_roles.some(ur => ur.user_id === adminId)) {
        loadedDB.user_roles.push({
          id: "role-admin-default",
          user_id: adminId,
          role: "team_leader"
        });
      }
    }
  }

  // Ensure we have some default Team Members with NFC uids seeded if empty for easy testing
  const seedTms = [
    { id: "tm-1", nome: "Maurício Silva (TM1)", email: "tm1@toyota-ovar.local", nfc_uid: "04:12:45:78" },
    { id: "tm-2", nome: "Rita Correia (TM2)", email: "tm2@toyota-ovar.local", nfc_uid: "54:ea:71:02" },
    { id: "tm-3", nome: "Eduardo Cruz (TM3)", email: "tm3@toyota-ovar.local", nfc_uid: "12:bc:90:ee" },
  ];

  seedTms.forEach(seed => {
    if (!loadedDB.profiles.some(p => p.id === seed.id)) {
      loadedDB.profiles.push({
        id: seed.id,
        nome: seed.nome,
        email: seed.email,
        nfc_uid: seed.nfc_uid,
        ativo: true,
        criado_em: new Date().toISOString()
      });
      
      if (!loadedDB.user_roles.some(ur => ur.user_id === seed.id)) {
        loadedDB.user_roles.push({
          id: `role-${seed.id}`,
          user_id: seed.id,
          role: "team_member"
        });
      }
    }
  });

  saveDB(loadedDB);
  return loadedDB;
}

function saveDB(db: DB) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  } catch (err) {
    console.error("Database write error:", err);
  }
}

// Initialize database
let db = loadDB();

// Audit log helper (replicates triggers logs)
function logCallStateChange(callId: string, deEstado: CallState | null, paraEstado: CallState, atorId: string | null) {
  const newAudit: AuditLog = {
    id: `audit-${Math.random().toString(36).substr(2, 9)}`,
    call_id: callId,
    de_estado: deEstado,
    para_estado: paraEstado,
    ator_id: atorId,
    criado_em: new Date().toISOString(),
  };
  
  // Lookup actor name for better logs interface
  const actor = db.profiles.find(p => p.id === atorId);
  if (actor) {
    newAudit.ator_nome = actor.nome;
  } else {
    // Check in fallback constant names
    const tmConst = TEAM_MEMBERS.find(t => t.id === atorId);
    if (tmConst) {
      newAudit.ator_nome = tmConst.nome;
    }
  }

  db.audit_log.unshift(newAudit); // newest first
  saveDB(db);
  broadcast("audit_logged", newAudit);
}

// --------------------------------------------------
// API ENDPOINTS
// --------------------------------------------------

// Clean server health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Serve app-icon dynamically for PWA manifest support
app.get("/app-icon.png", (req, res) => {
  const logoPath = path.join(process.cwd(), "src", "assets", "images", "logo__2_-removebg-preview.png");
  if (fs.existsSync(logoPath)) {
    res.sendFile(logoPath);
  } else {
    res.status(404).send("Logo not found");
  }
});

// Operators/Collaborators Management API
app.get("/api/operators", (req, res) => {
  const operators = db.profiles.map(p => {
    const roleRec = db.user_roles.find(ur => ur.user_id === p.id);
    return {
      ...p,
      role: roleRec ? roleRec.role : "team_member"
    };
  });
  res.json(operators);
});

app.post("/api/operators", (req, res) => {
  const { nome, email, role, nfc_uid } = req.body;
  if (!nome || !nome.trim()) {
    return res.status(400).json({ error: "O nome do colaborador é obrigatório." });
  }

  // Ensure unique NFC
  if (nfc_uid && nfc_uid.trim()) {
    const matched = db.profiles.find(p => p.nfc_uid && matchNfcUid(p.nfc_uid, nfc_uid));
    if (matched) {
      return res.status(400).json({ error: `O cartão NFC ${nfc_uid} já está associado ao colaborador ${matched.nome}.` });
    }
  }

  const cleanRole = role === "team_leader" ? "team_leader" : "team_member";
  const opId = `${cleanRole === "team_leader" ? "tl" : "tm"}-${Math.random().toString(36).substr(2, 9)}`;
  const opEmail = email ? email.trim() : `${nome.toLowerCase().replace(/\s+/g, ".")}@toyota-ovar.local`;

  const newProfile = {
    id: opId,
    nome: nome.trim(),
    email: opEmail,
    ativo: true,
    nfc_uid: nfc_uid ? nfc_uid.trim() : undefined,
    criado_em: new Date().toISOString()
  };

  db.profiles.push(newProfile);
  db.user_roles.push({
    id: `role-${Math.random().toString(36).substr(2, 9)}`,
    user_id: opId,
    role: cleanRole
  });

  saveDB(db);
  broadcast("system_reset", null); // Notify clients to reload state
  res.json({ success: true, operator: { ...newProfile, role: cleanRole } });
});

app.put("/api/operators/:id", (req, res) => {
  const { id } = req.params;
  const { nome, email, role, nfc_uid } = req.body;

  const profile = db.profiles.find(p => p.id === id);
  if (!profile) {
    return res.status(404).json({ error: "Colaborador não encontrado." });
  }

  if (nfc_uid && nfc_uid.trim()) {
    const matched = db.profiles.find(p => p.id !== id && p.nfc_uid && matchNfcUid(p.nfc_uid, nfc_uid));
    if (matched) {
      return res.status(400).json({ error: `O cartão NFC ${nfc_uid} já está associado ao colaborador ${matched.nome}.` });
    }
    profile.nfc_uid = nfc_uid.trim();
  } else if (nfc_uid === null || nfc_uid === "") {
    delete profile.nfc_uid;
  }

  if (nome && nome.trim()) profile.nome = nome.trim();
  if (email && email.trim()) profile.email = email.trim();

  if (role) {
    const cleanRole = role === "team_leader" ? "team_leader" : "team_member";
    const roleRec = db.user_roles.find(ur => ur.user_id === id);
    if (roleRec) {
      roleRec.role = cleanRole;
    } else {
      db.user_roles.push({
        id: `role-${Math.random().toString(36).substr(2, 9)}`,
        user_id: id,
        role: cleanRole
      });
    }
  }

  saveDB(db);
  broadcast("system_reset", null);
  res.json({ success: true, operator: { ...profile } });
});

app.delete("/api/operators/:id", (req, res) => {
  const { id } = req.params;

  // Rls check / fk constraint
  const cannotDelete = db.calls.some(c => c.team_member_id === id || c.atendida_por === id);
  if (cannotDelete) {
    return res.status(400).json({ error: "Este colaborador possui registros de chamadas ou atendimentos no histórico e não pode ser excluído." });
  }

  db.profiles = db.profiles.filter(p => p.id !== id);
  db.user_roles = db.user_roles.filter(ur => ur.user_id !== id);

  saveDB(db);
  broadcast("system_reset", null);
  res.json({ success: true });
});

// Authenticate via NFC
app.post("/api/auth/nfc-sign-in", (req, res) => {
  const { nfc_uid } = req.body;
  if (!nfc_uid || !nfc_uid.trim()) {
    return res.status(400).json({ error: "O número de cartão NFC é obrigatório." });
  }

  const cleanUid = nfc_uid.trim();
  console.log(`Verifying NFC Login: ${cleanUid}`);

  const matched = db.profiles.find(p => p.nfc_uid && matchNfcUid(p.nfc_uid, cleanUid));
  if (!matched) {
    return res.status(404).json({ error: `Nenhum utilizador associado ao cartão: "${cleanUid}"` });
  }

  const roleRec = db.user_roles.find(ur => ur.user_id === matched.id);
  const role = roleRec ? roleRec.role : "team_member";

  res.json({ success: true, user: matched, role });
});

// Server-Sent Realtime Events streaming
app.get("/api/realtime", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Send initial connection feedback
  res.write(`data: ${JSON.stringify({ event: "connected", message: "Logística Toyota Realtime Active Connection Established." })}\n\n`);

  sseClients.push(res);

  req.on("close", () => {
    sseClients = sseClients.filter((client) => client !== res);
  });
});

// Check if a Team Leader profile exists to run first-time bootstrap Setup
app.get("/api/check-tl", (req, res) => {
  const tlExists = db.user_roles.some(ur => ur.role === "team_leader");
  res.json({ exists: tlExists });
});

// Setup First Time - creates Team Leader and Seeds default accounts
app.post("/api/bootstrap", (req, res) => {
  const { nome, email, password } = req.body;
  if (!nome || !email || !password) {
    return res.status(400).json({ error: "Nome, email e senha são obrigatórios." });
  }

  // Ensure and prevent secondary bootstrapping if TL accounts exist
  const tlExists = db.user_roles.some(ur => ur.role === "team_leader");
  if (tlExists) {
    return res.status(400).json({ error: "Team Leader já configurado." });
  }

  // 1. Create Team Leader
  const tlId = `tl-${Math.random().toString(36).substr(2, 9)}`;
  const tlProfile: Profile = {
    id: tlId,
    nome,
    email,
    ativo: true,
    criado_em: new Date().toISOString(),
  };
  db.profiles.push(tlProfile);

  const tlRole: UserRole = {
    id: `role-${Math.random().toString(36).substr(2, 9)}`,
    user_id: tlId,
    role: "team_leader",
  };
  db.user_roles.push(tlRole);

  // 2. Clear out any legacy TM accounts and seed clean TM accounts with passwords
  db.profiles = db.profiles.filter(p => !p.id.startsWith("tm-"));
  db.user_roles = db.user_roles.filter(ur => !ur.user_id.startsWith("tm-"));

  TEAM_MEMBERS.forEach((tm) => {
    const tmProfile: Profile = {
      id: tm.id,
      nome: tm.nome,
      email: tm.email,
      ativo: true,
      criado_em: new Date().toISOString(),
    };
    db.profiles.push(tmProfile);

    const tmRole: UserRole = {
      id: `role-${Math.random().toString(36).substr(2, 9)}`,
      user_id: tm.id,
      role: "team_member",
    };
    db.user_roles.push(tmRole);
  });

  saveDB(db);
  broadcast("system_bootstrapped", { tlId, team_leaders: 1, team_members: TEAM_MEMBERS.length });

  res.json({ success: true, user: tlProfile, role: "team_leader" });
});

// Sign-In with authentication check matching SQLite rules
app.post("/api/auth/sign-in", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email e senha são requeridos." });
  }

  // Check if it is a seeded Team Member login
  const matchedTM = TEAM_MEMBERS.find(tm => tm.email === email);
  if (matchedTM) {
    if (password !== TM_SHARED_PASSWORD) {
      return res.status(401).json({ error: "Senha inválida para Team Member." });
    }
    // Success - Get Profile
    const profile = db.profiles.find(p => p.id === matchedTM.id) || {
      id: matchedTM.id,
      nome: matchedTM.nome,
      email: matchedTM.email,
      ativo: true,
      criado_em: new Date().toISOString()
    };
    
    // Ensure TM role exists in database table
    if (!db.user_roles.some(ur => ur.user_id === matchedTM.id)) {
      db.user_roles.push({
        id: `role-${Math.random().toString(36).substr(2, 9)}`,
        user_id: matchedTM.id,
        role: "team_member"
      });
      if (!db.profiles.some(p => p.id === matchedTM.id)) {
        db.profiles.push(profile);
      }
      saveDB(db);
    }

    return res.json({ success: true, user: profile, role: "team_member" });
  }

  // Check for Team Leader profile matches
  const matchedUser = db.profiles.find(p => p.email && p.email.toLowerCase() === email.toLowerCase());
  if (!matchedUser) {
    return res.status(404).json({ error: "Utilizador não encontrado no sistema." });
  }

  // Simple hardcoded simulator check for safety and demonstration
  // All password validations pass for simplicity, or we can check
  if (password.length < 4) {
    return res.status(401).json({ error: "Senha incorreta." });
  }

  const roleRecord = db.user_roles.find(ur => ur.user_id === matchedUser.id);
  const role = roleRecord ? roleRecord.role : "team_member";

  res.json({ success: true, user: matchedUser, role });
});

// Locations Management Endpoints
app.get("/api/locations", (req, res) => {
  res.json(db.locations.sort((a,b) => a.ordem - b.ordem));
});

app.post("/api/locations", (req, res) => {
  const { nome } = req.body;
  if (!nome || !nome.trim()) {
    return res.status(400).json({ error: "O nome do posto é obrigatório." });
  }

  const normalizedNome = nome.trim();
  const exists = db.locations.some(l => l.nome.toLowerCase() === normalizedNome.toLowerCase());
  if (exists) {
    return res.status(400).json({ error: "Posto já cadastrado." });
  }

  const nextOrder = db.locations.reduce((max, loc) => Math.max(max, loc.ordem), 0) + 1;
  const newLoc: Location = {
    id: `loc-${Math.random().toString(36).substr(2, 9)}`,
    nome: normalizedNome,
    ordem: nextOrder,
    ativo: true,
    criado_em: new Date().toISOString(),
  };

  db.locations.push(newLoc);
  saveDB(db);
  broadcast("locations_updated", db.locations);
  res.json(newLoc);
});

// Toggle location active state
app.put("/api/locations/:id/toggle", (req, res) => {
  const { id } = req.params;
  const loc = db.locations.find(l => l.id === id);
  if (!loc) {
    return res.status(404).json({ error: "Posto não encontrado." });
  }

  loc.ativo = !loc.ativo;
  saveDB(db);
  broadcast("locations_updated", db.locations);
  res.json(loc);
});

// Delete location with FK constraint simulator (cannot delete if calls exist)
app.delete("/api/locations/:id", (req, res) => {
  const { id } = req.params;
  
  // Verify foreign key reference simulator
  const activeUses = db.calls.some(c => c.location_id === id);
  if (activeUses) {
    return res.status(400).json({ error: "Não é possível apagar: Este posto possui registros de chamadas no histórico." });
  }

  db.locations = db.locations.filter(l => l.id !== id);
  saveDB(db);
  broadcast("locations_updated", db.locations);
  res.json({ success: true });
});

// Call Types Management Endpoints
app.get("/api/call_types", (req, res) => {
  res.json(db.call_types.sort((a,b) => a.ordem - b.ordem));
});

app.post("/api/call_types", (req, res) => {
  const { nome } = req.body;
  if (!nome || !nome.trim()) {
    return res.status(400).json({ error: "O nome do tipo é obrigatório." });
  }

  const normalizedNome = nome.trim();
  const exists = db.call_types.some(ct => ct.nome.toLowerCase() === normalizedNome.toLowerCase());
  if (exists) {
    return res.status(400).json({ error: "Tipo de chamada já cadastrado." });
  }

  const nextOrder = db.call_types.reduce((max, ct) => Math.max(max, ct.ordem), 0) + 1;
  const newType: CallType = {
    id: `ct-${Math.random().toString(36).substr(2, 9)}`,
    nome: normalizedNome,
    ordem: nextOrder,
    ativo: true,
    criado_em: new Date().toISOString(),
  };

  db.call_types.push(newType);
  saveDB(db);
  broadcast("call_types_updated", db.call_types);
  res.json(newType);
});

// Toggle Call Type active state
app.put("/api/call_types/:id/toggle", (req, res) => {
  const { id } = req.params;
  const ct = db.call_types.find(c => c.id === id);
  if (!ct) {
    return res.status(404).json({ error: "Tipo de chamada não encontrado." });
  }

  ct.ativo = !ct.ativo;
  saveDB(db);
  broadcast("call_types_updated", db.call_types);
  res.json(ct);
});

// Delete Call Type with Check
app.delete("/api/call_types/:id", (req, res) => {
  const { id } = req.params;
  
  const activeUses = db.calls.some(c => c.call_type_id === id);
  if (activeUses) {
    return res.status(400).json({ error: "Não é possível apagar: Tipo possui registros de no histórico." });
  }

  db.call_types = db.call_types.filter(c => c.id !== id);
  saveDB(db);
  broadcast("call_types_updated", db.call_types);
  res.json({ success: true });
});

// --------------------------------------------------
// CENTRAL CALL MANAGEMENT ENDPOINTS
// --------------------------------------------------

// Get calls list with details resolution
function resolveCalls(): Call[] {
  return db.calls.map((c) => {
    const tm = db.profiles.find(p => p.id === c.team_member_id) || TEAM_MEMBERS.find(t => t.id === c.team_member_id);
    const loc = db.locations.find(l => l.id === c.location_id);
    const ct = db.call_types.find(l => l.id === c.call_type_id);
    const tl = db.profiles.find(p => p.id === c.atendida_por);

    return {
      ...c,
      team_member_nome: tm ? tm.nome : "Operador Indefinido",
      location_nome: loc ? loc.nome : "Posto Removido",
      call_type_nome: ct ? ct.nome : "Motivo Removido",
      atendida_por_nome: tl ? tl.nome : (c.atendida_por ? "Team Leader" : null)
    };
  });
}

app.get("/api/calls", (req, res) => {
  res.json(resolveCalls().sort((a,b) => new Date(b.aberta_em).getTime() - new Date(a.aberta_em).getTime()));
});

// Get audit logs
app.get("/api/audit_log", (req, res) => {
  res.json(db.audit_log);
});

// Create fresh call (team member)
app.post("/api/calls", (req, res) => {
  const { team_member_id, location_id, call_type_id } = req.body;
  if (!team_member_id || !location_id || !call_type_id) {
    return res.status(400).json({ error: "Parâmetros obrigatórios ausentes." });
  }

  // Enforce rule: A Team Member can only have ONE non-resolved Call (aberta or em_atendimento) at a time
  const hasActiveCall = db.calls.some(
    c => c.team_member_id === team_member_id && (c.estado === "aberta" || c.estado === "em_atendimento")
  );
  if (hasActiveCall) {
    return res.status(400).json({ error: "Erro: Você já possui uma chamada ativa ou em atendimento na linha." });
  }

  // Build ID like CALL-0001
  const idNum = db.calls.length + 1;
  const callId = `CALL-${String(idNum).padStart(4, "0")}`;

  const newCall: Call = {
    id: callId,
    team_member_id,
    location_id,
    call_type_id,
    estado: "aberta",
    aberta_em: new Date().toISOString(),
    atendida_em: null,
    resolvida_em: null,
    cancelada_em: null,
    atendida_por: null,
    observacao: null,
  };

  db.calls.push(newCall);
  saveDB(db);

  // Trigger simulated post-insert trigger audit log
  logCallStateChange(callId, null, "aberta", team_member_id);

  // Read resolved detailed call for live updates UI
  const details = resolveCalls().find(c => c.id === callId)!;
  broadcast("call_created", details);

  res.json(details);
});

// Update call state representing andon process transitions
app.put("/api/calls/:id", (req, res) => {
  const { id } = req.params;
  const { estado, atendida_por, observacao } = req.body;

  const idx = db.calls.findIndex(c => c.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: "Chamada não encontrada." });
  }

  const calling = db.calls[idx];
  const oldState = calling.estado;
  
  if (oldState === estado) {
    return res.json(resolveCalls().find(c => c.id === id));
  }

  // Apply state transitions
  calling.estado = estado;

  if (estado === "em_atendimento") {
    calling.atendida_em = new Date().toISOString();
    calling.atendida_por = atendida_por || null;
  } else if (estado === "resolvida") {
    calling.resolvida_em = new Date().toISOString();
    if (observacao) {
      calling.observacao = observacao;
    }
  } else if (estado === "cancelada") {
    calling.cancelada_em = new Date().toISOString();
  }

  saveDB(db);

  // Trigger trigger audit
  logCallStateChange(calling.id, oldState, estado, atendida_por || calling.team_member_id);

  const details = resolveCalls().find(c => c.id === id)!;
  broadcast("call_updated", details);

  res.json(details);
});

// Clear ALL historical calls for easy testing/cleaning
app.post("/api/calls/reset", (req, res) => {
  db.calls = [];
  db.audit_log = [];
  saveDB(db);
  broadcast("system_reset", null);
  res.json({ success: true });
});

// --------------------------------------------------
// STREAMING CSV GENERATOR (api/export/calls.csv)
// --------------------------------------------------
app.get("/api/export/calls.csv", (req, res) => {
  const resolved = resolveCalls().sort((a,b) => new Date(a.aberta_em).getTime() - new Date(b.aberta_em).getTime());

  // Set download headers correctly with cached disabled
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="calls_${new Date().toISOString().split("T")[0]}.csv"`);
  res.setHeader("Cache-Control", "no-store");

  // Write UTF-8 Byte Order Mark (BOM) to force Excel to view accents correctly
  res.write("\uFEFF");

  // Headers matching specs
  const headers = [
    "ID Chamada",
    "Aberta Em",
    "Team Member",
    "Posto Local",
    "Tipo Chamada",
    "Estado",
    "Atendida Em",
    "Resolvida Em",
    "Cancelada Em",
    "Atendida Por",
    "Tempo Resposta (seg)",
    "Tempo Transicao Resolução (seg)",
    "Observação"
  ];
  
  res.write(headers.join(";") + "\n");

  resolved.forEach((c) => {
    // Calculators
    let respTime = "";
    if (c.atendida_em) {
      const diffMs = new Date(c.atendida_em).getTime() - new Date(c.aberta_em).getTime();
      respTime = String(Math.max(0, Math.floor(diffMs / 1000)));
    }

    let resolTime = "";
    if (c.resolvida_em && c.atendida_em) {
      const diffMs = new Date(c.resolvida_em).getTime() - new Date(c.atendida_em).getTime();
      resolTime = String(Math.max(0, Math.floor(diffMs / 1000)));
    }

    const row = [
      c.id,
      c.aberta_em,
      c.team_member_nome || "",
      c.location_nome || "",
      c.call_type_nome || "",
      c.estado ? c.estado.toUpperCase() : "",
      c.atendida_em || "",
      c.resolvida_em || "",
      c.cancelada_em || "",
      c.atendida_por_nome || "",
      respTime,
      resolTime,
      (c.observacao || "").replace(/"/g, '""')
    ];

    // Escape semicolons and format row
    const escapedRow = row.map(v => {
      const str = String(v);
      if (str.includes(";") || str.includes("\n") || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });

    res.write(escapedRow.join(";") + "\n");
  });

  res.end();
});

// --------------------------------------------------
// EXPRESS SERVER STARTUP AND VITE MIDDLEWARE
// --------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Development mode with Vite integration
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    
    // Vite handles static client-side asset re-routing
    app.use(vite.middlewares);
  } else {
    // Production compiled static bundles
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Logística Toyota - Andon Call System server listening at port ${PORT}`);
  });
}

startServer();
