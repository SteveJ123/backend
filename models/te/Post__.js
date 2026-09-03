import mongoose from "mongoose";

const PostSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      required: false,
    },

    tagIds: [
      {
        type: String,
      },
    ],

    membershipIds: [
      {
        type: String,
      },
    ],

    mediaFiles: [
      {
        filename: String,
        path: String,
        mimetype: String,
        mediaType: String,
      },
    ],
  },
  {
    timestamps: true,
  },
);

const Post = mongoose.model("Post", PostSchema);

export default Post;
