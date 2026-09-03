import mongoose from "mongoose";

const lectureSchema = new mongoose.Schema({
  title: { type: String, required: true },
  videoUrl: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const courseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      enum: ["Face Yoga", "Face Yoga + Raj Yoga"],
      trim: true,
    },
    description: { type: String, required: true },
    instructor: { type: String, default: "Pooja Agarwala" },
    thumbnail: { type: String, required: true },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    status: {
      type: String,
      enum: ["in_progress", "completed", "not_started"],
      default: "not_started",
    },
    isPaid: { type: Boolean, default: false },
    isNewCourse: { type: Boolean, default: true },
    lectures: { type: [lectureSchema], default: [] },
    language: {
      type: String,
      required: true,
      enum: ["English", "Telugu"],
      index: true,
    },
  },
  { timestamps: true },
);

export default mongoose.models.Course || mongoose.model("Course", courseSchema);
