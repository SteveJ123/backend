import { mongoose } from "mongoose";

const courseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Course title is required"],
      trim: true,
    },
    description: {
      type: String,
      required: [true, "Course description is required"],
    },
    instructor: {
      type: String,
      default: "Pooja Agarwala",
    },
    thumbnail: {
      type: String,
      required: [true, "Thumbnail image path is required"],
    },
    // sectionsCount: {
    //   type: Number,
    //   default: 1,
    //   min: 1,
    // },
    // lecturesCount: {
    //   type: Number,
    //   default: 1,
    //   min: 1,
    // },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    status: {
      type: String,
      enum: ["in_progress", "completed", "not_started"],
      default: "not_started",
    },
    isPaid: {
      type: Boolean,
      default: false,
    },
    isNewCourse: {
      type: Boolean,
      default: true,
    },
    // membershipType: {
    //   type: String,
    //   default: "Standard",
    // },
  },
  {
    timestamps: true, // Automatically creates createdAt and updatedAt fields
  },
);

const Course = mongoose.model("Course", courseSchema);
export default Course;
