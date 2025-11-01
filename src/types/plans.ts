export type PlanDefinition = {
  /**
   * Identificador do documento na coleção do Firestore.
   */
  documentId: string;
  /**
   * Slug utilizado para construir a URL pública do plano.
   */
  slug: string;
  /**
   * Código interno que coincide com o serviceType utilizado na Rapidoc.
   */
  id: string;
  /**
   * Código informado para a Rapidoc. Mantemos separado para compatibilidade com cadastros antigos.
   */
  serviceType: string;
  /**
   * UUID do plano na Rapidoc (novo formato)
   */
  rapidocUuid?: string;
  name: string;
  description: string;
  value: number;
  /**
   * Número máximo de dependentes permitidos no plano.
   */
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
  slug?: string;
  rapidocUuid?: string;
};

export type PlanUpdatePayload = {
  name?: string;
  description?: string;
  value?: number;
  maxDependents?: number;
  slug?: string;
  rapidocUuid?: string;
};
