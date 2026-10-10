import { useMemo } from "react";
import { useApiClient } from "./client";
import type { MealAnalysis, MealLog, MealLogCreate } from "./types";

export interface MealsResponse {
  date: string;
  meals: MealLog[];
  totals: { calories: number; protein_g: number };
}

export function useMealsApi() {
  const client = useApiClient();

  return useMemo(
    () => ({
      getMeals: (date: string) => client.get<MealsResponse>(`/api/meals?date=${date}`),
      createMeal: (data: MealLogCreate) => client.post<MealLog>("/api/meals", data),
      updateMeal: (id: string, data: Omit<MealLogCreate, "date">) =>
        client.put<MealLog>(`/api/meals/${id}`, data),
      deleteMeal: (id: string) => client.del<{ ok: true }>(`/api/meals/${id}`),
      analyzeMeal: (formData: FormData) =>
        client.postFormData<MealAnalysis>("/api/meals/analyze", formData),
    }),
    [client],
  );
}
