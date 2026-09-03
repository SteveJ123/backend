import express from "express";
import fs from "fs";
import Course from "../models/te/Course.js";
import upload from "../middleware/uploadLecture.js";

const router = express.Router();

// Ensure 'uploads/videos' directory exists on app startup
if (!fs.existsSync("./uploads/videos")) {
  fs.mkdirSync("./uploads/videos", { recursive: true });
}

// GET: Fetch details and lectures for a specific course
router.get("/:id", async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) {
      return res
        .status(404)
        .json({ success: false, message: "Course not found" });
    }

    res.status(200).json({ success: true, data: course });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST: Admin upload a video file and attach the lecture to the course
router.post("/:id/lectures", upload.single("video"), async (req, res) => {
  try {
    const { title, duration } = req.body;

    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No video file provided" });
    }

    // Relative web URL stored in the DB
    const videoUrl = `/uploads/videos/${req.file.filename}`;

    // Append lecture to array using $push
    const updatedCourse = await Course.findByIdAndUpdate(
      req.params.id,
      {
        $push: {
          lectures: {
            title,
            videoUrl,
          },
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

export default router;
