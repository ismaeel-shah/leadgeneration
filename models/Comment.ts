import mongoose, { type Model, Schema, Types } from "mongoose";

export interface IComment {
  userId: Types.ObjectId;
  profileId: Types.ObjectId;
  leadId?: Types.ObjectId;
  postUrl: string;
  postAuthorName?: string;
  note?: string;
  commentedAt: Date;
  createdAt?: Date;
}

const CommentSchema = new Schema<IComment>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    profileId: { type: Schema.Types.ObjectId, required: true },
    leadId: Schema.Types.ObjectId,
    postUrl: { type: String, required: true, trim: true },
    postAuthorName: { type: String, trim: true },
    note: String,
    commentedAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

CommentSchema.index({ userId: 1, profileId: 1, commentedAt: -1 });

const Comment = (mongoose.models.Comment || mongoose.model<IComment>("Comment", CommentSchema)) as Model<IComment>;
export default Comment;
