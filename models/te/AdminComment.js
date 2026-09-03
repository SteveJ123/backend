import mongoose from "mongoose";

const AdminCommentSchema = new mongoose.Schema(
  {
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AdminPost",
      required: true,
      index: true, // Speeds up queries filtering by admin post
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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
      ref: "AdminComment",
      default: null, // null = top-level comment, string/ObjectId = reply
      index: true,
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt
  },
);

// Compound index to optimize fetching replies per admin post rapidly
AdminCommentSchema.index({ postId: 1, parentId: 1 });

const AdminComment = mongoose.model("AdminComment", AdminCommentSchema);
export default AdminComment;
