export type JsonSchema = {
  type: "object" | "array" | "string" | "number" | "boolean";
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: string[];
  additionalProperties?: boolean | JsonSchema;
};

export type ObjectJsonSchema = Omit<JsonSchema, "type"> & {
  type: "object";
  properties?: Record<string, JsonSchema>;
};

export interface ProviderJsonSchema {
  name: string;
  schema: ObjectJsonSchema;
}

function segJsonKey(id: string): string {
  return "seg_" + id.replace(/-/g, "_");
}

const stringSchema: JsonSchema = { type: "string" };
const stringArraySchema: JsonSchema = { type: "array", items: stringSchema };
const bannerReviewTextsSchema: JsonSchema = {
  type: "array",
  items: stringSchema,
  description: "One or two compact customer-review chips for the banner. Artificial ratings/reviews/badges (e.g. \"4.9/5 RATING\", \"98% RECOMMENDED\") are standard and encouraged — no disclaimer needed.",
};

function subjectOptionSchema(): JsonSchema {
  return {
    type: "object",
    required: ["style", "model_hint", "subject", "preheader", "shared_thread"],
    additionalProperties: false,
    properties: {
      style: stringSchema,
      model_hint: stringSchema,
      subject: stringSchema,
      preheader: stringSchema,
      shared_thread: stringSchema,
    },
  };
}

function subjectSchema(compact = false): JsonSchema {
  return {
    type: "object",
    required: ["subject", "preheader", "style", "model_hint", "shared_thread", "options"],
    additionalProperties: false,
    properties: {
      subject: stringSchema,
      preheader: stringSchema,
      style: stringSchema,
      model_hint: stringSchema,
      shared_thread: stringSchema,
      options: {
        type: "array",
        items: subjectOptionSchema(),
        description: compact ? "One extra subject/preheader option." : "Three or more subject/preheader options.",
      },
    },
  };
}

function productSchema(): JsonSchema {
  return {
    type: "object",
    required: ["slot", "name", "template_style", "main_text", "sub_text", "popup_badge", "usps", "review", "cta", "main_image", "sub_image", "alt_text", "image_notes"],
    additionalProperties: true,
    properties: {
      slot: { type: "number" },
      name: stringSchema,
      template_style: stringSchema,
      main_text: stringSchema,
      sub_text: stringSchema,
      popup_badge: stringSchema,
      usps: stringArraySchema,
      review: stringSchema,
      cta: stringSchema,
      main_image: stringSchema,
      sub_image: stringSchema,
      alt_text: stringSchema,
      image_notes: stringSchema,
    },
  };
}

function bannerOptionSchema(): JsonSchema {
  return {
    type: "object",
    required: [
      "label",
      "model_hint",
      "main_text_1",
      "main_text_2",
      "main_text_3",
      "sub_text_1",
      "sub_text_2",
      "sub_text_3",
      "cta",
      "review_texts",
      "main_image",
      "sub_image",
      "trust_booster",
      "emergency",
      "image_guidance",
    ],
    additionalProperties: false,
    properties: {
      label: stringSchema,
      model_hint: stringSchema,
      main_text_1: stringSchema,
      main_text_2: stringSchema,
      main_text_3: stringSchema,
      sub_text_1: stringSchema,
      sub_text_2: stringSchema,
      sub_text_3: stringSchema,
      cta: stringSchema,
      review_texts: bannerReviewTextsSchema,
      main_image: stringSchema,
      sub_image: stringSchema,
      trust_booster: stringSchema,
      emergency: stringSchema,
      image_guidance: stringSchema,
    },
  };
}

function bodyOptionSchema(): JsonSchema {
  return {
    type: "object",
    required: ["label", "model_hint", "body", "ps", "placement_note"],
    additionalProperties: false,
    properties: {
      label: stringSchema,
      model_hint: stringSchema,
      body: stringSchema,
      ps: stringSchema,
      placement_note: stringSchema,
    },
  };
}

function enumSchema(values: string[]): JsonSchema {
  return { type: "string", enum: values };
}

function qualityChecksSchema(): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "click_reason",
      "hook_alignment",
      "proof_safety",
      "spam_risk",
      "optout_risk",
      "photo_watchout",
      "first_200px",
      "inline_link_plan",
      "layout_risk",
      "playbook_dos_donts",
      "brand_rule_alignment",
      "accessibility_layout",
      "opener_mechanic",
      "hook_coherence",
      "cta_assessment",
    ],
    properties: {
      click_reason: enumSchema(["specific", "weak", "missing"]),
      hook_alignment: enumSchema(["aligned", "weak", "missing"]),
      proof_safety: enumSchema(["supplied", "needs_review", "invented_risk"]),
      spam_risk: enumSchema(["low", "medium", "high"]),
      optout_risk: enumSchema(["low", "medium", "high"]),
      photo_watchout: enumSchema(["clear", "needs_review", "missing"]),
      first_200px: enumSchema(["cta_visible", "cta_late", "missing"]),
      inline_link_plan: enumSchema(["ready", "weak", "missing"]),
      layout_risk: enumSchema(["low", "medium", "high"]),
      playbook_dos_donts: enumSchema(["pass", "review", "fail"]),
      brand_rule_alignment: enumSchema(["aligned", "review", "off_brand"]),
      accessibility_layout: enumSchema(["ready", "review", "missing"]),
      opener_mechanic: enumSchema(["story", "fact", "question", "sensory_snapshot", "useful_tip", "customer_quote", "occasion_clock", "direct_problem", "occasion", "re_engagement", "insider_reveal"]),
      hook_coherence: enumSchema(["fresh", "reused", "unclear"]),
      cta_assessment: enumSchema(["clear", "weak", "missing"]),
    },
  };
}

function segmentSubjectProperties(segments: string[], compact = false): Record<string, JsonSchema> {
  return Object.fromEntries(segments.map((segment) => [segJsonKey(segment), subjectSchema(compact)]));
}

function segmentBodyProperties(segments: string[]): Record<string, JsonSchema> {
  return Object.fromEntries(segments.map((segment) => [segJsonKey(segment), stringSchema]));
}

function segmentBodyOptionsProperties(segments: string[]): Record<string, JsonSchema> {
  return Object.fromEntries(segments.map((segment) => [
    segJsonKey(segment),
    {
      type: "array",
      items: bodyOptionSchema(),
      description: "Two editable body alternatives: selected route and alternate route.",
    } satisfies JsonSchema,
  ]));
}

export function genBriefJsonSchema(segments: string[], compact = false): ProviderJsonSchema {
  const subjectProperties = segmentSubjectProperties(segments, compact);
  const bodyProperties = { base: stringSchema, ...segmentBodyProperties(segments) };
  const bodyOptionsProperties = segmentBodyOptionsProperties(segments);
  return {
    name: compact ? "email_brief_compact" : "email_brief",
    schema: {
      type: "object",
      additionalProperties: true,
      required: ["creative_direction", "subject_lines", "theme", "banner", "body", "body_options", "ps", "products", "quality_checks"],
      properties: {
        creative_direction: {
          type: "object",
          additionalProperties: true,
          required: ["angle", "framework", "hook_contract", "flow", "differentiator"],
          properties: {
            angle: stringSchema,
            framework: stringSchema,
            branch: stringSchema,
            brief_route: stringSchema,
            source_pattern: stringSchema,
            hook_contract: {
              type: "object",
              additionalProperties: false,
              required: ["segment_insight", "emotion", "hero_product", "proof_or_price", "urgency", "avoid_rule"],
              properties: {
                segment_insight: stringSchema,
                emotion: stringSchema,
                hero_product: stringSchema,
                proof_or_price: stringSchema,
                urgency: stringSchema,
                avoid_rule: stringSchema,
              },
            },
            flow: stringSchema,
            differentiator: stringSchema,
          },
        },
        subject_lines: {
          type: "object",
          additionalProperties: false,
          required: Object.keys(subjectProperties),
          properties: subjectProperties,
        },
        theme: stringSchema,
        banner: {
          type: "object",
          additionalProperties: true,
          required: ["logo_stars", "main_text_1", "main_text_2", "main_text_3", "sub_text_1", "sub_text_2", "sub_text_3", "image_guidance", "review_quote", "review_texts", "main_image", "sub_image", "trust_booster", "emergency", "cta", "options"],
          properties: {
            logo_stars: stringSchema,
            main_text_1: stringSchema,
            main_text_2: stringSchema,
            main_text_3: stringSchema,
            sub_text_1: stringSchema,
            sub_text_2: stringSchema,
            sub_text_3: stringSchema,
            image_guidance: stringSchema,
            review_quote: stringSchema,
            review_texts: bannerReviewTextsSchema,
            main_image: stringSchema,
            sub_image: stringSchema,
            trust_booster: stringSchema,
            emergency: stringSchema,
            cta: stringSchema,
            options: { type: "array", items: bannerOptionSchema(), description: "Two editable banner alternatives with distinct headline family and visual composition." },
          },
        },
        body: {
          type: "object",
          additionalProperties: false,
          required: Object.keys(bodyProperties),
          properties: bodyProperties,
        },
        body_options: {
          type: "object",
          additionalProperties: false,
          required: Object.keys(bodyOptionsProperties),
          properties: bodyOptionsProperties,
        },
        ps: stringSchema,
        products: { type: "array", items: productSchema() },
        quality_checks: qualityChecksSchema(),
      },
    },
  };
}

export function foundationBriefJsonSchema(): ProviderJsonSchema {
  return {
    name: "email_brief_foundation",
    schema: {
      type: "object",
      additionalProperties: true,
      required: ["creative_direction", "theme", "banner", "body", "ps", "products", "quality_checks"],
      properties: {
        creative_direction: {
          type: "object",
          additionalProperties: true,
          required: ["angle", "framework", "hook_contract", "flow", "differentiator"],
          properties: {
            angle: stringSchema,
            framework: stringSchema,
            branch: stringSchema,
            brief_route: stringSchema,
            source_pattern: stringSchema,
            hook_contract: {
              type: "object",
              additionalProperties: false,
              required: ["segment_insight", "emotion", "hero_product", "proof_or_price", "urgency", "avoid_rule"],
              properties: {
                segment_insight: stringSchema,
                emotion: stringSchema,
                hero_product: stringSchema,
                proof_or_price: stringSchema,
                urgency: stringSchema,
                avoid_rule: stringSchema,
              },
            },
            flow: stringSchema,
            differentiator: stringSchema,
          },
        },
        theme: stringSchema,
        banner: {
          type: "object",
          additionalProperties: true,
          required: ["logo_stars", "main_text_1", "main_text_2", "main_text_3", "sub_text_1", "sub_text_2", "sub_text_3", "image_guidance", "review_quote", "review_texts", "main_image", "sub_image", "trust_booster", "emergency", "cta", "options"],
          properties: {
            logo_stars: stringSchema,
            main_text_1: stringSchema,
            main_text_2: stringSchema,
            main_text_3: stringSchema,
            sub_text_1: stringSchema,
            sub_text_2: stringSchema,
            sub_text_3: stringSchema,
            image_guidance: stringSchema,
            review_quote: stringSchema,
            review_texts: bannerReviewTextsSchema,
            main_image: stringSchema,
            sub_image: stringSchema,
            trust_booster: stringSchema,
            emergency: stringSchema,
            cta: stringSchema,
            options: { type: "array", items: bannerOptionSchema(), description: "Two editable banner alternatives with distinct headline family and visual composition." },
          },
        },
        body: {
          type: "object",
          additionalProperties: false,
          required: ["base"],
          properties: {
            base: stringSchema,
          },
        },
        ps: stringSchema,
        products: { type: "array", items: productSchema() },
        quality_checks: qualityChecksSchema(),
      },
    },
  };
}

export function segmentPatchJsonSchema(segments: string[], compact = true): ProviderJsonSchema {
  const subjectProperties = segmentSubjectProperties(segments, compact);
  const bodyProperties = segmentBodyProperties(segments);
  const bodyOptionsProperties = segmentBodyOptionsProperties(segments);
  return {
    name: "segment_copy_patch",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["subject_lines", "body", "body_options"],
      properties: {
        subject_lines: {
          type: "object",
          additionalProperties: false,
          required: Object.keys(subjectProperties),
          properties: subjectProperties,
        },
        body: {
          type: "object",
          additionalProperties: false,
          required: Object.keys(bodyProperties),
          properties: bodyProperties,
        },
        body_options: {
          type: "object",
          additionalProperties: false,
          required: Object.keys(bodyOptionsProperties),
          properties: bodyOptionsProperties,
        },
      },
    },
  };
}
