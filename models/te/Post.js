import mongoose from "mongoose";

const PostSchema = new mongoose.Schema(
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
    tagIds: [
      {
        type: String,
      },
    ],
    courseType: [
      {
        type: String,
      },
    ],
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
    // Tracks views count
    views: {
      type: Number,
      default: 0,
    },
    // Array of user IDs who liked the post to track toggle status per user
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    // Total count of likes
    likeCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

// module.exports = mongoose.model("Post", postSchema);
const Post = mongoose.model("Post", PostSchema);
export default Post;
