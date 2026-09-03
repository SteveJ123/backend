import mongoose from "mongoose";

const AdminCommentSchema = new mongoose.Schema(
  {
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AdminPost",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AdminComment",
      default: null, // null = top-level comment, ObjectId = reply
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// Compound index to optimize rapid query lookups for parent comments and nested replies
AdminCommentSchema.index({ postId: 1, parentId: 1, createdAt: 1 });

const AdminComment = mongoose.model("AdminComment", AdminCommentSchema);
export default AdminComment;
