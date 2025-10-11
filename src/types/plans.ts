export type PlanDefinition = {
  /**
   * Código interno que coincide com o serviceType utilizado na Rapidoc.
   */
  id: string;
  /**
   * Código informado para a Rapidoc. Mantemos separado para compatibilidade com cadastros antigos.
   */
  serviceType: string;
  name: string;
  description: string;
  value: number;
  /** Número máximo de dependentes permitidos no plano. */
  maxDependents: number;
  createdAt: string;
  updatedAt: string;
};

export type PlanPayload = {
  id: string;
  name: string;
  description?: string;
  value: number;
  maxDependents?: number;
};

export type PlanUpdatePayload = {
  name?: string;
  description?: string;
  value?: number;
  maxDependents?: number;
};
