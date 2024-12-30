import { Schema, model } from 'mongoose';

export interface IBug {
    description: string;
    reproduction: string;
    frequency: string;
    screenshot: string;
    resolved: boolean;
    createdAt?: String;
}

export const BugSchema = new Schema<IBug>({
    description: { type: String, required: true },
    reproduction: { type: String, required: true },
    frequency: { type: String, required: true },
    screenshot: { type: String, required: false, default: null },
    resolved: { type: Boolean, required: true, default: false },
    createdAt: { type: String, required: true }
});

export const Bug = model<IBug>('report', BugSchema);