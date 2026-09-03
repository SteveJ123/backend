import mongoose from "mongoose";

const EnlectureSchema = new mongoose.Schema({
  title: { type: String, required: true },
  videoUrl: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const EncourseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
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
    lectures: { type: [EnlectureSchema], default: [] }, // Embedded sub-documents
  },
  { timestamps: true },
);

export default mongoose.models.EnCourse ||
  mongoose.model("EnCourse", EncourseSchema);
