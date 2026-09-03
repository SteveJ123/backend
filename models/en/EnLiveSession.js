import mongoose from "mongoose";

const EnliveSessionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    date: { type: String, required: true }, // e.g., "Aug 31, 2026"
    startTime: { type: String, required: true }, // e.g., "7:00 AM"
    endTime: { type: String, required: true }, // e.g., "8:20 AM"
    occurrence: { type: String, default: "" }, // e.g., "Occurrence 85 of 189"
    linkTypeNote: {
      type: String,
      default: "(Zoom Meeting - recurring fixed link)",
    },
    meetingUrl: { type: String, required: true }, // Zoom or external URL
    courseType: {
      type: String,
      required: true,
      enum: ["Face Yoga", "Face Yoga + Raj Yoga"],
      default: "Face Yoga",
    },
  },
  { timestamps: true },
);

export default mongoose.models.EnLiveSession ||
  mongoose.model("EnLiveSession", EnliveSessionSchema);
