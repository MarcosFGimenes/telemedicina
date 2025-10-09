export type PlanDefinition = {
  /**
   * Identificador interno do plano. Mantido por compatibilidade com telas existentes.
   */
  id: string;
  /**
   * Código serviceType exposto pela Rapidoc.
   */
  serviceType: string;
  name: string;
  description: string;
  value: number;
  /**
   * Número máximo de dependentes permitidos para o plano. Null ou zero significa sem limite definido.
   */
  maxDependents: number | null;
  createdAt: string;
  updatedAt: string;
};

export type PlanPayload = {
  id: string;
  serviceType?: string;
  name: string;
  description?: string;
  value: number;
  maxDependents?: number | null;
};

export type PlanUpdatePayload = {
  serviceType?: string;
  name?: string;
  description?: string;
  value?: number;
  maxDependents?: number | null;
};
