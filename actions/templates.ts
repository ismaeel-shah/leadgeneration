"use server";

import { revalidatePath } from "next/cache";
import { Types } from "mongoose";
import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import Template, { templateTypes } from "@/models/Template";
import type { ActionResult } from "./types";
import { actionError } from "./types";

const templateSchema = z.object({
  name: z.string().trim().min(1, "Name this template.").max(100),
  type: z.enum(templateTypes),
  country: z.string().trim().toUpperCase().regex(/^([A-Z]{2})?$/, "Use a two-letter country code.").optional(),
  service: z.string().trim().max(100).optional(),
  isDefault: z.boolean().default(false),
  body: z.string().trim().min(1, "Write a message before saving.").max(5000),
});

export type TemplateInput = z.input<typeof templateSchema>;
export type TemplateDTO = {
  id: string;
  name: string;
  type: (typeof templateTypes)[number];
  country?: string;
  service?: string;
  isDefault: boolean;
  body: string;
  createdAt?: string;
  updatedAt?: string;
};

type TemplateRecord = {
  _id: Types.ObjectId;
  name: string;
  type: TemplateDTO["type"];
  country?: string;
  service?: string;
  isDefault: boolean;
  body: string;
  createdAt?: Date;
  updatedAt?: Date;
};

function toDTO(template: TemplateRecord): TemplateDTO {
  return {
    id: String(template._id),
    name: template.name,
    type: template.type,
    country: template.country || undefined,
    service: template.service || undefined,
    isDefault: template.isDefault,
    body: template.body,
    createdAt: template.createdAt?.toISOString(),
    updatedAt: template.updatedAt?.toISOString(),
  };
}

function normalize(input: z.output<typeof templateSchema>) {
  return {
    ...input,
    country: input.country || undefined,
    service: input.service || undefined,
  };
}

export async function listTemplates(): Promise<TemplateDTO[]> {
  const userId = await requireUserId();
  await connectDB();
  const templates = await Template.find({ userId }).sort({ type: 1, isDefault: -1, name: 1 }).lean();
  return templates.map((template) => toDTO(template as TemplateRecord));
}

export async function createTemplate(input: TemplateInput): Promise<ActionResult<TemplateDTO>> {
  try {
    const userId = await requireUserId();
    const parsed = templateSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the template." };
    const data = normalize(parsed.data);
    if (data.isDefault && (data.country || data.service)) {
      return { ok: false, error: "A default template must apply to every country and service." };
    }
    await connectDB();
    const template = await Template.create({ userId, ...data });
    if (data.isDefault) {
      await Template.updateMany({ userId, type: data.type, _id: { $ne: template._id } }, { $set: { isDefault: false } });
    }
    revalidatePath("/templates");
    return { ok: true, data: toDTO(template.toObject() as TemplateRecord) };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateTemplate(id: string, input: TemplateInput): Promise<ActionResult<TemplateDTO>> {
  try {
    const userId = await requireUserId();
    if (!Types.ObjectId.isValid(id)) return { ok: false, error: "Template not found." };
    const parsed = templateSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the template." };
    const data = normalize(parsed.data);
    if (data.isDefault && (data.country || data.service)) {
      return { ok: false, error: "A default template must apply to every country and service." };
    }
    await connectDB();
    const template = await Template.findOneAndUpdate(
      { _id: new Types.ObjectId(id), userId },
      { $set: data, $unset: { ...(data.country ? {} : { country: 1 }), ...(data.service ? {} : { service: 1 }) } },
      { returnDocument: "after", runValidators: true },
    ).lean();
    if (!template) return { ok: false, error: "Template not found." };
    if (data.isDefault) {
      await Template.updateMany({ userId, type: data.type, _id: { $ne: template._id } }, { $set: { isDefault: false } });
    }
    revalidatePath("/templates");
    return { ok: true, data: toDTO(template as TemplateRecord) };
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteTemplate(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    const userId = await requireUserId();
    if (!Types.ObjectId.isValid(id)) return { ok: false, error: "Template not found." };
    await connectDB();
    const removed = await Template.findOneAndDelete({ _id: new Types.ObjectId(id), userId });
    if (!removed) return { ok: false, error: "Template not found." };
    revalidatePath("/templates");
    return { ok: true, data: { id } };
  } catch (error) {
    return actionError(error);
  }
}
