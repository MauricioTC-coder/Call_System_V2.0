/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const TEAM_MEMBERS = [
  { id: "tm-1", nome: "Team Member 1", email: "tm1@toyota-ovar.local" },
  { id: "tm-2", nome: "Team Member 2", email: "tm2@toyota-ovar.local" },
  { id: "tm-3", nome: "Team Member 3", email: "tm3@toyota-ovar.local" },
  { id: "tm-4", nome: "Team Member 4", email: "tm4@toyota-ovar.local" },
] as const;

export const TM_SHARED_PASSWORD = "toyota2025!";

export const DEFAULT_LOCATIONS = [
  { nome: "Posto 01", ordem: 1 },
  { nome: "Posto 02", ordem: 2 },
  { nome: "Posto 03", ordem: 3 },
  { nome: "Área de Picking", ordem: 4 },
  { nome: "Área de Sequenciação", ordem: 5 },
  { nome: "Supermercado", ordem: 6 },
  { nome: "Receção de Material", ordem: 7 },
  { nome: "Zona de Abastecimento", ordem: 8 },
  { nome: "Outro", ordem: 9 },
];

export const DEFAULT_CALL_TYPES = [
  { nome: "Material", ordem: 1 },
  { nome: "Qualidade", ordem: 2 },
  { nome: "Equipamento", ordem: 3 },
  { nome: "Segurança", ordem: 4 },
  { nome: "Apoio de Processo", ordem: 5 },
  { nome: "Outro", ordem: 6 },
];
