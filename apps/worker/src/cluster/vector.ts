/** Produit scalaire ; pour des vecteurs normalisés, c'est la similarité cosinus. */
export function dot(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}

export function normalize(vector: readonly number[]): number[] {
  const norm = Math.sqrt(dot(vector, vector));
  return norm === 0 ? [...vector] : vector.map((value) => value / norm);
}

/** Similarité cosinus, quelle que soit la norme des vecteurs. */
export function cosine(a: readonly number[], b: readonly number[]): number {
  const denominator = Math.sqrt(dot(a, a) * dot(b, b));
  return denominator === 0 ? 0 : dot(a, b) / denominator;
}

/** Somme terme à terme, utilisée pour tenir à jour un centroïde. */
export function addInto(target: number[], vector: readonly number[]): void {
  for (let i = 0; i < vector.length; i++) target[i] = (target[i] ?? 0) + (vector[i] ?? 0);
}
