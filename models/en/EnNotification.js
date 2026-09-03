import mongoose from "mongoose";

const EnnotificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "EnUser",
    required: true,
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "EnUser",
    required: true,
  },
  postId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: "postModel",
  },
  // Specifies which model to populate from ('Post' or 'AdminPost')
  postModel: {
    type: String,
    required: true,
    enum: ["EnPost", "EnAdminPost"],
    default: "EnPost",
  },
  postContentSnippet: { type: String, required: true }, // truncated content
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("EnNotification", EnnotificationSchema);
