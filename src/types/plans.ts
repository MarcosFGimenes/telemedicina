export type PlanDefinition = {
  /**
   * Código interno que coincide com o serviceType utilizado na Rapidoc.
   */
  id: string;
  name: string;
  description: string;
  value: number;
  createdAt: string;
  updatedAt: string;
};

export type PlanPayload = {
  id: string;
  name: string;
  description?: string;
  value: number;
};

export type PlanUpdatePayload = {
  name?: string;
  description?: string;
  value?: number;
};
