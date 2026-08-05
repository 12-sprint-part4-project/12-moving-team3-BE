export interface DesignatedEstimateMoverDto {
  id: number;
  estimateId: number;
  moverId: string;
}

export interface DesignatedEstimateExistenceDto {
  exists: boolean;
  designatedEstimateRequest: DesignatedEstimateMoverDto | null;
}
