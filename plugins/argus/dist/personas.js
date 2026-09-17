import catalog from "./personas.json" with { type: "json" };
/** Display identity only. Runtime reviewer IDs and host agent handles stay stable. */
export const PERSONAS = Object.freeze(catalog);
export function personaLabel(reviewer) {
    if (!Object.hasOwn(PERSONAS, reviewer))
        return reviewer;
    const persona = PERSONAS[reviewer];
    return `${persona.name} (${reviewer})`;
}
