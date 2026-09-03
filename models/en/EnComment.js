import mongoose from "mongoose";

const EnCommentSchema = new mongoose.Schema(
  {
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EnPost",
      required: true,
      index: true, // Speeds up queries filtering by post
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
      ref: "EnComment",
      default: null, // null = top-level comment, string/ObjectId = reply
      index: true,
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt
  },
);

// Compound index to optimize fetching replies per post rapidly
EnCommentSchema.index({ postId: 1, parentId: 1 });

// module.exports = mongoose.model("Comment", commentSchema);
const EnComment = mongoose.model("EnComment", EnCommentSchema);
export default EnComment;
