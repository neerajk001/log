import { useMemo } from "react";
import { useApiClient } from "./client";
import type {
  EatingOutAnalysis,
  MealAnalysis,
  MealLog,
  MealLogCreate,
  MealSuggestionsResponse,
} from "./types";

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
        client.postFormData<MealAnalysis>("/api/meals/analyze", formData, {
          invalidate: false,
        }),
      /** Pro: meals from the athlete's own history that fit today's remaining macros. */
      getMealSuggestions: (date: string) =>
        client.get<MealSuggestionsResponse>(`/api/meals/suggestions?date=${date}`),
      /** Pro: two orders inside the remaining macros, from a menu photo or text. */
      analyzeEatingOut: (formData: FormData) =>
        client.postFormData<EatingOutAnalysis>("/api/meals/eating-out", formData, {
          invalidate: false,
        }),
    }),
    [client],
  );
}
