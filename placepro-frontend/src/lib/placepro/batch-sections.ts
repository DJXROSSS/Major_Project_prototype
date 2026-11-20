export const MAX_SECTION_COUNT = 1000;
export const MAX_SECTION_NAME_LENGTH = 10;

export type SectionResult = { sections: string[]; error: string };

export function sectionNameAt(position: number): string {
  let value = position;
  let name = "";
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

export function generateSectionNames(rawCount: string): SectionResult {
  const value = rawCount.trim();
  if (!/^[1-9]\d*$/.test(value)) {
    return { sections: [], error: "Enter a positive whole number." };
  }
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count > MAX_SECTION_COUNT) {
    return { sections: [], error: `Enter no more than ${MAX_SECTION_COUNT} sections.` };
  }
  return {
    sections: Array.from({ length: count }, (_, index) => sectionNameAt(index + 1)),
    error: "",
  };
}

export function parseManualSectionNames(input: string): SectionResult {
  if (!input.trim()) return { sections: [], error: "Enter at least one section name." };
  const sections = input.split(",").map((section) => section.trim());
  if (sections.some((section) => !section)) {
    return { sections: [], error: "Section names cannot be empty." };
  }
  if (sections.length > MAX_SECTION_COUNT) {
    return { sections: [], error: `Enter no more than ${MAX_SECTION_COUNT} sections.` };
  }
  if (sections.some((section) => section.length > MAX_SECTION_NAME_LENGTH)) {
    return { sections: [], error: `Section names must be ${MAX_SECTION_NAME_LENGTH} characters or fewer.` };
  }
  const normalized = sections.map((section) => section.toLocaleLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    return { sections: [], error: "Section names must be unique." };
  }
  return { sections, error: "" };
}

export function uniqueSectionNames(sections: string[]): string[] {
  const seen = new Set<string>();
  return sections.map((section) => String(section).trim()).filter((section) => {
    const key = section.toLocaleLowerCase();
    if (!section || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
