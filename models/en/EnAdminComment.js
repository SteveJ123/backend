import mongoose from "mongoose";

const EnAdminCommentSchema = new mongoose.Schema(
  {
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EnAdminPost",
      required: true,
      index: true, // Speeds up queries filtering by admin post
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EnUser",
      required: true,
    },
    username: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EnAdminComment",
      default: null, // null = top-level comment, string/ObjectId = reply
      index: true,
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt
  },
);

// Compound index to optimize fetching replies per admin post rapidly
EnAdminCommentSchema.index({ postId: 1, parentId: 1 });

const EnAdminComment = mongoose.model("EnAdminComment", EnAdminCommentSchema);
export default EnAdminComment;
