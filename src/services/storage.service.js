/**
 * Storage Service
 * Manages VPS storage for course videos
 * @module services/storage
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const Logger = require('../utils/logger.util');

const execAsync = promisify(exec);

// Storage configuration
const STORAGE_BASE = process.env.VPS_STORAGE_PATH || '/data/courses';
const STAGING_PATH = process.env.STAGING_PATH || path.join(__dirname, '../../udemy_dl/Staging_Download');

/**
 * Course storage paths
 */
const PATHS = {
    permanent: path.join(STORAGE_BASE, 'permanent'),
    temporary: path.join(STORAGE_BASE, 'temporary'),
    temp: path.join(STORAGE_BASE, 'temp')
};

/**
 * Ensure storage directories exist
 */
const ensureStorageDirectories = async () => {
    try {
        for (const dir of Object.values(PATHS)) {
            await fs.mkdir(dir, { recursive: true });
        }
        Logger.info('[Storage] Directories initialized', { base: STORAGE_BASE });
        return true;
    } catch (error) {
        Logger.error('[Storage] Failed to create directories', error);
        throw error;
    }
};

/**
 * Generate storage path for a course
 * @param {string} courseSlug - Course slug
 * @param {string} courseType - 'permanent' or 'temporary'
 * @returns {string} Full path to course directory
 */
const getCoursePath = (courseSlug, courseType = 'permanent') => {
    const basePath = PATHS[courseType] || PATHS.permanent;
    return path.join(basePath, courseSlug);
};

/**
 * Copy course from staging to VPS storage
 * @param {string} stagingFolder - Source folder name in Staging_Download
 * @param {string} courseSlug - Course slug for destination
 * @param {string} courseType - 'permanent' or 'temporary'
 * @returns {Promise<Object>} Copy result with path and stats
 */
const copyFromStaging = async (stagingFolder, courseSlug, courseType = 'permanent') => {
    const sourcePath = path.join(STAGING_PATH, stagingFolder);
    const destPath = getCoursePath(courseSlug, courseType);

    try {
        // Check source exists
        const sourceStats = await fs.stat(sourcePath);
        if (!sourceStats.isDirectory()) {
            throw new Error(`Source is not a directory: ${sourcePath}`);
        }

        // Ensure destination parent exists
        await fs.mkdir(path.dirname(destPath), { recursive: true });

        // Use rsync for efficient copy with progress
        const rsyncCmd = `rsync -av --progress "${sourcePath}/" "${destPath}/"`;

        Logger.info('[Storage] Starting copy from staging', {
            source: stagingFolder,
            destination: destPath,
            courseType
        });

        const { stdout, stderr } = await execAsync(rsyncCmd, { maxBuffer: 50 * 1024 * 1024 });

        // Get destination stats
        const destStats = await getDirectoryStats(destPath);

        Logger.success('[Storage] Copy completed', {
            courseSlug,
            totalFiles: destStats.fileCount,
            totalSize: formatBytes(destStats.totalSize)
        });

        return {
            success: true,
            path: destPath,
            stats: destStats
        };

    } catch (error) {
        Logger.error('[Storage] Failed to copy from staging', error, {
            source: stagingFolder,
            courseSlug
        });
        throw error;
    }
};

/**
 * Get directory statistics
 * @param {string} dirPath - Directory path
 * @returns {Promise<Object>} Stats with file count and total size
 */
const getDirectoryStats = async (dirPath) => {
    let fileCount = 0;
    let totalSize = 0;
    let videoCount = 0;

    const scanDir = async (dir) => {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                await scanDir(fullPath);
            } else {
                fileCount++;
                const stats = await fs.stat(fullPath);
                totalSize += stats.size;

                if (entry.name.endsWith('.mp4') || entry.name.endsWith('.webm')) {
                    videoCount++;
                }
            }
        }
    };

    await scanDir(dirPath);

    return { fileCount, totalSize, videoCount };
};

/**
 * Get course structure for metadata
 * @param {string} coursePath - Path to course directory
 * @returns {Promise<Object>} Course structure with sections and lectures
 */
const getCourseStructure = async (coursePath) => {
    const structure = {
        sections: [],
        totalLectures: 0,
        totalDuration: 0,
        hasSubtitles: false,
        hasResources: false
    };

    try {
        const entries = await fs.readdir(coursePath, { withFileTypes: true });

        // Sort entries naturally (1. Section, 2. Section, 10. Section)
        const sortedEntries = entries
            .filter(e => e.isDirectory())
            .sort((a, b) => {
                const numA = parseInt(a.name.match(/^(\d+)/)?.[1] || '0');
                const numB = parseInt(b.name.match(/^(\d+)/)?.[1] || '0');
                return numA - numB;
            });

        for (let i = 0; i < sortedEntries.length; i++) {
            const sectionDir = sortedEntries[i];
            const sectionPath = path.join(coursePath, sectionDir.name);
            const section = {
                position: i + 1,
                title: cleanSectionTitle(sectionDir.name),
                lectures: []
            };

            // Scan section for videos
            const sectionFiles = await fs.readdir(sectionPath, { withFileTypes: true });
            const videoFiles = sectionFiles
                .filter(f => f.isFile() && (f.name.endsWith('.mp4') || f.name.endsWith('.webm')))
                .sort((a, b) => {
                    const numA = parseInt(a.name.match(/^(\d+)/)?.[1] || '0');
                    const numB = parseInt(b.name.match(/^(\d+)/)?.[1] || '0');
                    return numA - numB;
                });

            for (let j = 0; j < videoFiles.length; j++) {
                const videoFile = videoFiles[j];
                const videoPath = path.join(sectionPath, videoFile.name);

                // Get video duration (simplified - actual implementation might use ffprobe)
                const videoStats = await fs.stat(videoPath);

                section.lectures.push({
                    position: j + 1,
                    title: cleanLectureTitle(videoFile.name),
                    filename: videoFile.name,
                    relativePath: path.join(sectionDir.name, videoFile.name),
                    size: videoStats.size
                });

                structure.totalLectures++;
            }

            // Check for subtitles
            const subtitleFiles = sectionFiles.filter(f =>
                f.name.endsWith('.srt') || f.name.endsWith('.vtt')
            );
            if (subtitleFiles.length > 0) {
                structure.hasSubtitles = true;
            }

            // Check for resources
            const resourceFiles = sectionFiles.filter(f =>
                f.name.endsWith('.pdf') || f.name.endsWith('.zip') || f.name.endsWith('.html')
            );
            if (resourceFiles.length > 0) {
                structure.hasResources = true;
            }

            structure.sections.push(section);
        }

        return structure;

    } catch (error) {
        Logger.error('[Storage] Failed to get course structure', error, { coursePath });
        throw error;
    }
};

/**
 * Clean section title (remove numbering prefix)
 */
const cleanSectionTitle = (dirName) => {
    return dirName.replace(/^\d+[\.\-_\s]+/, '').trim();
};

/**
 * Clean lecture title (remove numbering and extension)
 */
const cleanLectureTitle = (fileName) => {
    return fileName
        .replace(/^\d+[\.\-_\s]+/, '')
        .replace(/\.(mp4|webm|mkv)$/i, '')
        .trim();
};

/**
 * Format bytes to human readable
 */
const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Check if course exists in storage
 */
const courseExists = async (courseSlug, courseType = 'permanent') => {
    const coursePath = getCoursePath(courseSlug, courseType);
    try {
        await fs.access(coursePath);
        return true;
    } catch {
        return false;
    }
};

/**
 * Delete course from storage
 */
const deleteCourse = async (courseSlug, courseType = 'permanent') => {
    const coursePath = getCoursePath(courseSlug, courseType);
    try {
        await fs.rm(coursePath, { recursive: true });
        Logger.info('[Storage] Deleted course', { courseSlug, coursePath });
        return true;
    } catch (error) {
        Logger.error('[Storage] Failed to delete course', error, { courseSlug });
        throw error;
    }
};

module.exports = {
    STORAGE_BASE,
    PATHS,
    ensureStorageDirectories,
    getCoursePath,
    copyFromStaging,
    getDirectoryStats,
    getCourseStructure,
    courseExists,
    deleteCourse,
    formatBytes
};
