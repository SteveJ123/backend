import mongoose from "mongoose";

const AdminPostSchema = new mongoose.Schema(
  {
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
    // CRITICAL: Restricts admin posts to English or Telugu streams
    language: {
      type: String,
      enum: ["English", "Telugu"],
      required: true,
      index: true,
    },
    tagIds: [{ type: String }],
    courseType: [{ type: String }],
    mediaFiles: [
      {
        filename: String,
        path: String,
        mimetype: String,
        mediaType: {
          type: String,
          enum: ["image", "video", "audio", "file"],
        },
      },
    ],
    views: { type: Number, default: 0 },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    likeCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

AdminPostSchema.index({ language: 1, createdAt: -1 });

const AdminPost = mongoose.model("AdminPost", AdminPostSchema);
export default AdminPost;
