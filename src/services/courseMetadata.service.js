/**
 * Course Metadata Service
 * Extracts and saves course structure from downloaded folders
 * @module services/courseMetadata
 */

const fs = require('fs').promises;
const path = require('path');
const { Course } = require('../models');
const storageService = require('./storage.service');
const Logger = require('../utils/logger.util');

/**
 * Extract metadata and save to database
 * @param {number} courseId - Course ID in database
 * @param {string} coursePath - Path to course folder on VPS
 * @returns {Promise<Object>} Saved metadata
 */
const extractAndSaveMetadata = async (courseId, coursePath) => {
    try {
        Logger.info('[Metadata] Extracting course structure', { courseId, coursePath });

        // Get course structure
        const structure = await storageService.getCourseStructure(coursePath);

        // Get directory stats
        const stats = await storageService.getDirectoryStats(coursePath);

        // Update course with metadata
        const course = await Course.findByPk(courseId);
        if (!course) {
            throw new Error(`Course not found: ${courseId}`);
        }

        await course.update({
            vps_path: coursePath,
            total_sections: structure.sections.length,
            total_lectures: structure.totalLectures,
            total_size: stats.totalSize,
            has_subtitles: structure.hasSubtitles,
            has_resources: structure.hasResources,
            streaming_ready: true
        });

        // Save sections and lectures to database
        await saveSectionsAndLectures(courseId, structure.sections);

        Logger.success('[Metadata] Course metadata saved', {
            courseId,
            sections: structure.sections.length,
            lectures: structure.totalLectures
        });

        return {
            success: true,
            courseId,
            sections: structure.sections.length,
            lectures: structure.totalLectures,
            totalSize: storageService.formatBytes(stats.totalSize)
        };

    } catch (error) {
        Logger.error('[Metadata] Failed to extract metadata', error, { courseId });
        throw error;
    }
};

/**
 * Save sections and lectures to database
 * @param {number} courseId - Course ID
 * @param {Array} sections - Sections with lectures
 */
const saveSectionsAndLectures = async (courseId, sections) => {
    const sequelize = require('../config/database');

    // Use transaction for atomic operation
    const transaction = await sequelize.transaction();

    try {
        // Delete existing sections and lectures for this course
        await sequelize.query(
            'DELETE FROM course_lectures WHERE section_id IN (SELECT id FROM course_sections WHERE course_id = ?)',
            { replacements: [courseId], transaction }
        );
        await sequelize.query(
            'DELETE FROM course_sections WHERE course_id = ?',
            { replacements: [courseId], transaction }
        );

        // Insert sections and lectures
        for (const section of sections) {
            const [sectionResult] = await sequelize.query(
                `INSERT INTO course_sections (course_id, title, position, created_at, updated_at) 
         VALUES (?, ?, ?, NOW(), NOW())`,
                {
                    replacements: [courseId, section.title, section.position],
                    transaction
                }
            );

            const sectionId = sectionResult;

            for (const lecture of section.lectures) {
                await sequelize.query(
                    `INSERT INTO course_lectures (section_id, title, position, filename, relative_path, size, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
                    {
                        replacements: [
                            sectionId,
                            lecture.title,
                            lecture.position,
                            lecture.filename,
                            lecture.relativePath,
                            lecture.size
                        ],
                        transaction
                    }
                );
            }
        }

        await transaction.commit();
        Logger.info('[Metadata] Sections and lectures saved', { courseId, sections: sections.length });

    } catch (error) {
        await transaction.rollback();
        Logger.error('[Metadata] Failed to save sections', error, { courseId });
        throw error;
    }
};

/**
 * Get course curriculum from database
 * @param {number} courseId - Course ID
 * @returns {Promise<Object>} Curriculum with sections and lectures
 */
const getCourseCurriculum = async (courseId) => {
    const sequelize = require('../config/database');

    try {
        // Get sections
        const [sections] = await sequelize.query(
            `SELECT id, title, position 
       FROM course_sections 
       WHERE course_id = ? 
       ORDER BY position`,
            { replacements: [courseId] }
        );

        // Get lectures for each section
        for (const section of sections) {
            const [lectures] = await sequelize.query(
                `SELECT id, title, position, filename, relative_path, size
         FROM course_lectures 
         WHERE section_id = ?
         ORDER BY position`,
                { replacements: [section.id] }
            );
            section.lectures = lectures;
        }

        return {
            courseId,
            totalSections: sections.length,
            totalLectures: sections.reduce((sum, s) => sum + s.lectures.length, 0),
            sections
        };

    } catch (error) {
        Logger.error('[Metadata] Failed to get curriculum', error, { courseId });
        throw error;
    }
};

/**
 * Get single lecture info
 * @param {number} lectureId - Lecture ID
 * @returns {Promise<Object>} Lecture info
 */
const getLecture = async (lectureId) => {
    const sequelize = require('../config/database');

    const [lectures] = await sequelize.query(
        `SELECT l.*, s.course_id, s.title as section_title, c.slug as course_slug, c.course_type
     FROM course_lectures l
     JOIN course_sections s ON l.section_id = s.id
     JOIN courses c ON s.course_id = c.id
     WHERE l.id = ?`,
        { replacements: [lectureId] }
    );

    return lectures[0] || null;
};

module.exports = {
    extractAndSaveMetadata,
    saveSectionsAndLectures,
    getCourseCurriculum,
    getLecture
};
