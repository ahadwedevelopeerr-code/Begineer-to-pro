const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const dataFile = path.join(__dirname, '..', 'data', 'courses.json');
const readCourses = () => JSON.parse(fs.readFileSync(dataFile, 'utf8'));

router.get('/', (req, res) => res.json(readCourses()));
router.get('/:slug', (req, res) => {
  const course = readCourses().find(item => item.slug === req.params.slug);
  if (!course) return res.status(404).json({ error: 'Course not found.' });
  return res.json(course);
});

module.exports = router;