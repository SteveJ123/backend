import mongoose from "mongoose";

const liveSessionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    date: { type: String, required: true }, // e.g., "Aug 31, 2026"
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    occurrence: { type: String, default: "" },
    linkTypeNote: {
      type: String,
      default: "(Zoom Meeting - recurring fixed link)",
    },
    meetingUrl: { type: String, required: true },
    courseType: {
      type: String,
      required: true,
      enum: ["Face Yoga", "Face Yoga + Raj Yoga"],
      default: "Face Yoga",
    },
    language: {
      type: String,
      required: true,
      enum: ["English", "Telugu"],
      index: true,
    },
  },
  { timestamps: true },
);

export default mongoose.models.LiveSession ||
  mongoose.model("LiveSession", liveSessionSchema);
