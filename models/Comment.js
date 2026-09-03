import mongoose from "mongoose";

const CommentSchema = new mongoose.Schema(
  {
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true,
      index: true, // Speeds up queries filtering by post
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
      ref: "Comment",
      default: null, // null = top-level comment, string/ObjectId = reply
      index: true,
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt
  },
);

// Compound index to optimize fetching replies per post rapidly
CommentSchema.index({ postId: 1, parentId: 1 });

// module.exports = mongoose.model("Comment", commentSchema);
const Comment = mongoose.model("Comment", CommentSchema);
export default Comment;
