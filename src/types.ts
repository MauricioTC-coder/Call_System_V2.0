/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type AppRole = 'admin' | 'team_leader' | 'team_member';
export type CallState = 'aberta' | 'em_atendimento' | 'resolvida' | 'cancelada';

export interface Profile {
  id: string; // uuid
  nome: string;
  email: string;
  nfc_uid?: string; // Optional raw or normalized NFC card UID serial number
  ativo: boolean;
  criado_em: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
}

export interface Location {
  id: string;
  nome: string;
  ordem: number;
  ativo: boolean;
  criado_em: string;
}

export interface CallType {
  id: string;
  nome: string;
  ordem: number;
  ativo: boolean;
  criado_em: string;
}

export interface Call {
  id: string; // "CALL-XXXX"
  team_member_id: string;
  location_id: string;
  call_type_id: string;
  estado: CallState;
  aberta_em: string;
  atendida_em: string | null;
  resolvida_em: string | null;
  cancelada_em: string | null;
  atendida_por: string | null;
  observacao: string | null;
  
  // Expanded for UI resolution
  team_member_nome?: string;
  location_nome?: string;
  call_type_nome?: string;
  atendida_por_nome?: string | null;
}

export interface AuditLog {
  id: string;
  call_id: string;
  de_estado: CallState | null;
  para_estado: CallState;
  ator_id: string | null;
  ator_nome?: string;
  criado_em: string;
}

export interface LiveStats {
  total: number;
  abertas: number;
  emAtendimento: number;
  resolvidas: number;
  canceladas: number;
  tempoMedioAtendimento: number; // in seconds
  tempoMedioResolucao: number; // in seconds
}
