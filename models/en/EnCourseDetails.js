import mongoose from "mongoose";

const EnlectureSchema = new mongoose.Schema({
  title: { type: String, required: true },
  videoUrl: { type: String, required: true },
  duration: { type: String },
  createdAt: { type: Date, default: Date.now },
});

const EncourseDetailsSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String },
    instructor: { type: String },
    thumbnail: { type: String },
    membershipType: { type: String },
    lectures: [lectureSchema], // Array of video lectures embedded inside the course
  },
  { timestamps: true },
);

const EnCourseDetails = mongoose.model(
  "EnCourseDetails",
  EncourseDetailsSchema,
);
export default EnCourseDetails;
