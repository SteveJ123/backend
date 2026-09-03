import express from "express";
import fs from "fs";
import Course from "../models/te/Course.js"; // Standardized model import
import upload from "../middleware/uploadLecture.js";

const router = express.Router();

// Ensure destination directory exists on server startup
if (!fs.existsSync("./uploads/videos")) {
  fs.mkdirSync("./uploads/videos", { recursive: true });
}

// POST: Admin upload video file and add lecture
router.post("/:id/lectures", upload.single("video"), async (req, res) => {
  try {
    const { title, duration } = req.body;

    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No video file provided" });
    }

    const videoUrl = `/uploads/videos/${req.file.filename}`;

    // Append lecture to array using the imported 'Course' model
    const updatedCourse = await Course.findByIdAndUpdate(
      req.params.id,
      {
        $push: {
          lectures: { title, videoUrl, duration },
        },
      },
      { new: true, runValidators: true },
    );

    if (!updatedCourse) {
      return res
        .status(404)
        .json({ success: false, message: "Course not found" });
    }

    res.status(200).json({
      success: true,
      message: "Video lecture uploaded successfully",
      data: updatedCourse,
    });
  } catch (error) {
    console.error("Upload Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Upload video file and add lecture
// router.post("/:id/lectures", upload.single("video"), async (req, res) => {
//   try {
//     const { title, duration } = req.body;

//     if (!req.file) {
//       return res
//         .status(400)
//         .json({ success: false, message: "No video file provided" });
//     }

//     const course = await Course.findById(req.params.id);
//     if (!course) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Course not found" });
//     }

//     const videoUrl = `/uploads/videos/${req.file.filename}`;

//     course.lectures.push({ title, videoUrl, duration });
//     await course.save();

//     res.status(200).json({
//       success: true,
//       message: "Video lecture uploaded successfully",
//       data: course,
//     });
//   } catch (error) {
//     res.status(500).json({ success: false, error: error.message });
//   }
// });

// Get single course details (including video lectures)
router.get("/:id", async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course)
      return res
        .status(404)
        .json({ success: false, message: "Course not found" });
    res.status(200).json({ success: true, data: course });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Add a video lecture to a specific course
// router.post("/:id/lectures", async (req, res) => {
//   try {
//     const { title, videoUrl, duration } = req.body;

//     const course = await Course.findById(req.params.id);
//     if (!course)
//       return res
//         .status(404)
//         .json({ success: false, message: "Course not found" });

//     course.lectures.push({ title, videoUrl, duration });
//     await course.save();

//     res.status(200).json({
//       success: true,
//       message: "Video lecture added successfully",
//       data: course,
//     });
//   } catch (error) {
//     res.status(500).json({ success: false, error: error.message });
//   }
// });

export default router;
