import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  postId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: "postModel",
  },
  // Specifies which model to populate from ('Post' or 'AdminPost')
  postModel: {
    type: String,
    required: true,
    enum: ["Post", "AdminPost"],
    default: "Post",
  },
  postContentSnippet: { type: String, required: true }, // truncated content
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Notification", notificationSchema);
