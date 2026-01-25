/**
 * Curriculum Scanner
 * Scans and extracts curriculum from Udemy courses
 * @module crawler/scanCurriculum
 */

const cheerio = require('cheerio');
const fs = require('fs').promises;
const { validateCourseUrl } = require('./urlValidator');

/**
 * Parse duration string (e.g., "1:03", "1hr 3min", "21h 7m") thành seconds
 */
function parseDurationToSeconds(durationStr) {
    if (!durationStr) return 0;
    
    let totalSeconds = 0;
    
    // Format: "1:03" (minutes:seconds)
    const mmssMatch = durationStr.match(/^(\d+):(\d+)$/);
    if (mmssMatch) {
        return parseInt(mmssMatch[1]) * 60 + parseInt(mmssMatch[2]);
    }
    
    // Format: "1hr 3min" hoặc "1h 3m"
    const hoursMatch = durationStr.match(/(\d+)\s*(?:hr|h|hour|hours)/i);
    if (hoursMatch) {
        totalSeconds += parseInt(hoursMatch[1]) * 3600;
    }
    
    const minutesMatch = durationStr.match(/(\d+)\s*(?:min|m|minute|minutes)/i);
    if (minutesMatch) {
        totalSeconds += parseInt(minutesMatch[1]) * 60;
    }
    
    const secondsMatch = durationStr.match(/(\d+)\s*(?:sec|s|second|seconds)/i);
    if (secondsMatch) {
        totalSeconds += parseInt(secondsMatch[1]);
    }
    
    return totalSeconds;
}

/**
 * Trích xuất curriculum từ JSON-LD script tags
 * JSON-LD có thể chứa thông tin đầy đủ về khóa học kể cả các sections bị ẩn
 */
function extractCurriculumFromJsonLd($) {
    const curriculum = {
        total_sections: 0,
        total_lectures: 0,
        total_duration_seconds: 0,
        sections: []
    };
    
    // Tìm tất cả script tags có type="application/ld+json"
    const jsonLdScripts = $('script[type="application/ld+json"]');
    
    if (jsonLdScripts.length === 0) {
        return null;
    }
    
    console.log(`  📋 Tìm thấy ${jsonLdScripts.length} JSON-LD script(s)`);
    
    // Duyệt qua tất cả JSON-LD scripts
    let foundCurriculum = false;
    
    jsonLdScripts.each((i, elem) => {
        try {
            const scriptContent = $(elem).html();
            if (!scriptContent) return;
            
            // Parse JSON-LD
            let jsonLdData = null;
            let courseObj = null;
            
            // Có thể là array hoặc object
            if (scriptContent.trim().startsWith('[')) {
                jsonLdData = JSON.parse(scriptContent);
                // Nếu là array, tìm Course object trong đó
                if (Array.isArray(jsonLdData)) {
                    courseObj = jsonLdData.find(item => {
                        const type = item['@type'];
                        return type === 'Course' || 
                               type === 'http://schema.org/Course' ||
                               type === 'https://schema.org/Course' ||
                               (Array.isArray(type) && type.some(t => t.includes('Course')));
                    });
                }
            } else {
                jsonLdData = JSON.parse(scriptContent);
                
                // Kiểm tra xem có @graph không (JSON-LD format với multiple objects)
                if (jsonLdData['@graph'] && Array.isArray(jsonLdData['@graph'])) {
                    courseObj = jsonLdData['@graph'].find(item => {
                        const type = item['@type'];
                        return type === 'Course' || 
                               type === 'http://schema.org/Course' ||
                               type === 'https://schema.org/Course' ||
                               (Array.isArray(type) && type.some(t => t.includes('Course')));
                    });
                } else {
                    // Kiểm tra @type - có thể là string hoặc array
                    const itemType = jsonLdData['@type'];
                    const isCourse = itemType === 'Course' || 
                                   itemType === 'http://schema.org/Course' ||
                                   itemType === 'https://schema.org/Course' ||
                                   (Array.isArray(itemType) && itemType.some(t => 
                                       t === 'Course' || t === 'http://schema.org/Course' || t === 'https://schema.org/Course'
                                   ));
                    
                    if (isCourse) {
                        courseObj = jsonLdData;
                    }
                }
            }
            
            if (!courseObj) {
                return; // Không tìm thấy Course object, bỏ qua
            }
            
            console.log(`  📚 Tìm thấy Course JSON-LD: ${courseObj.name || courseObj.headline || 'N/A'}`);
            
            // Tìm curriculum/sections trong JSON-LD
            // Schema.org Course có thể có hasCourseInstance, hasPart, coursePrerequisites
            // Nhưng curriculum thường nằm trong nested structure hoặc Udemy-specific properties
            
            const findSections = (obj, depth = 0, path = []) => {
                if (depth > 15) return null; // Tránh đệ quy quá sâu
                if (!obj || typeof obj !== 'object') return null;
                
                // Tránh vòng lặp vô hạn (circular references)
                if (depth > 0 && path.length > 0) {
                    const objStr = JSON.stringify(obj).substring(0, 100);
                    if (path.includes(objStr)) return null;
                }
                
                // 1. Tìm sections array trực tiếp
                if (obj.sections && Array.isArray(obj.sections) && obj.sections.length > 0) {
                    return obj.sections;
                }
                
                // 2. Tìm curriculum object với sections
                if (obj.curriculum) {
                    if (obj.curriculum.sections && Array.isArray(obj.curriculum.sections) && obj.curriculum.sections.length > 0) {
                        return obj.curriculum.sections;
                    }
                    // Đệ quy vào curriculum
                    const found = findSections(obj.curriculum, depth + 1, [...path, 'curriculum']);
                    if (found) return found;
                }
                
                // 3. Tìm trong hasCourseInstance (schema.org)
                if (obj.hasCourseInstance) {
                    const instances = Array.isArray(obj.hasCourseInstance) 
                        ? obj.hasCourseInstance 
                        : [obj.hasCourseInstance];
                    for (const instance of instances) {
                        const found = findSections(instance, depth + 1, [...path, 'hasCourseInstance']);
                        if (found) return found;
                    }
                }
                
                // 4. Tìm trong hasPart (schema.org - có thể chứa sections)
                if (obj.hasPart) {
                    const parts = Array.isArray(obj.hasPart) ? obj.hasPart : [obj.hasPart];
                    // Nếu hasPart là array các objects giống sections
                    if (parts.length > 0 && parts[0].items) {
                        // Có thể đây là sections
                        return parts;
                    }
                    for (const part of parts) {
                        const found = findSections(part, depth + 1, [...path, 'hasPart']);
                        if (found) return found;
                    }
                }
                
                // 5. Tìm trong coursePrerequisites (có thể chứa curriculum structure)
                if (obj.coursePrerequisites) {
                    const found = findSections(obj.coursePrerequisites, depth + 1, [...path, 'coursePrerequisites']);
                    if (found) return found;
                }
                
                // 6. Tìm trong Udemy-specific properties
                const udemyProps = ['courseData', 'courseContent', 'content', 'modules', 'chapters'];
                for (const prop of udemyProps) {
                    if (obj[prop]) {
                        const found = findSections(obj[prop], depth + 1, [...path, prop]);
                        if (found) return found;
                    }
                }
                
                // 7. Đệ quy vào tất cả properties (tránh các properties đặc biệt)
                const skipProps = ['@type', '@id', '@context', 'name', 'description', 'url', 'image'];
                for (const key in obj) {
                    if (obj.hasOwnProperty(key) && !skipProps.includes(key)) {
                        if (typeof obj[key] === 'object' && obj[key] !== null) {
                            // Bỏ qua arrays nhỏ (có thể là strings hoặc primitives)
                            if (Array.isArray(obj[key]) && obj[key].length > 0) {
                                // Nếu array chứa objects có structure giống section
                                if (typeof obj[key][0] === 'object' && obj[key][0] !== null) {
                                    const firstItem = obj[key][0];
                                    if (firstItem.items || firstItem.title || firstItem.name) {
                                        // Có thể đây là sections array
                                        return obj[key];
                                    }
                                }
                            }
                            const found = findSections(obj[key], depth + 1, [...path, key]);
                            if (found) return found;
                        }
                    }
                }
                
                return null;
            };
            
            // Tìm sections - ưu tiên syllabusSections (schema.org format)
            let sections = null;
            
            // 1. Kiểm tra syllabusSections (schema.org Syllabus format)
            if (courseObj.syllabusSections && Array.isArray(courseObj.syllabusSections)) {
                sections = courseObj.syllabusSections;
                console.log(`  📋 Tìm thấy syllabusSections: ${sections.length} items`);
            } else {
                // 2. Tìm đệ quy trong nested structure
                sections = findSections(courseObj);
            }
            
            if (sections && Array.isArray(sections) && sections.length > 0) {
                console.log(`  🔍 Tìm thấy ${sections.length} sections trong JSON-LD`);
                foundCurriculum = true;
                
                sections.forEach((section, sectionIndex) => {
                    // Kiểm tra xem section có phải là object hợp lệ không
                    if (!section || typeof section !== 'object') return;
                    
                    // Parse timeRequired từ ISO 8601 (PT41M)
                    let sectionDuration = 0;
                    if (section.timeRequired) {
                        const timeMatch = section.timeRequired.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
                        if (timeMatch) {
                            const hours = parseInt(timeMatch[1] || 0);
                            const minutes = parseInt(timeMatch[2] || 0);
                            const seconds = parseInt(timeMatch[3] || 0);
                            sectionDuration = hours * 3600 + minutes * 60 + seconds;
                        }
                    }
                    
                    const sectionData = {
                        section_id: section.id || section['@id'] || String(sectionIndex),
                        section_index: sectionIndex + 1,
                        title: section.name || section.title || section.headline || '',
                        description: section.description || section.about || '',
                        type: section['@type'] || section.type || 'COURSE_SECTION',
                        lecture_count: section.lectureCount || section.itemCount || (section.items?.length || section.numberOfItems || 0),
                        content_length_seconds: section.contentLength || sectionDuration || 0,
                        lectures: []
                    };
                    
                    // Tìm lectures/items trong section - thử nhiều properties
                    let items = [];
                    if (section.items && Array.isArray(section.items)) {
                        items = section.items;
                    } else if (section.hasPart && Array.isArray(section.hasPart)) {
                        items = section.hasPart;
                    } else if (section.coursePrerequisites && Array.isArray(section.coursePrerequisites)) {
                        items = section.coursePrerequisites;
                    } else if (section.lectures && Array.isArray(section.lectures)) {
                        items = section.lectures;
                    } else if (section.content && Array.isArray(section.content)) {
                        items = section.content;
                    }
                    
                    if (Array.isArray(items) && items.length > 0) {
                        items.forEach((item, lectureIndex) => {
                            // Bỏ qua nếu không phải object
                            if (!item || typeof item !== 'object') return;
                            
                            // Parse duration từ nhiều format
                            let durationSeconds = 0;
                            
                            // Thử durationInSeconds trước (Udemy format)
                            if (item.durationInSeconds !== undefined) {
                                durationSeconds = parseInt(item.durationInSeconds) || 0;
                            }
                            // Thử duration (có thể là ISO 8601 hoặc seconds)
                            else if (item.duration !== undefined) {
                                if (typeof item.duration === 'string') {
                                    // ISO 8601 format: PT1H30M15S hoặc P1DT2H3M4S
                                    const iso8601Match = item.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
                                    if (iso8601Match) {
                                        const hours = parseInt(iso8601Match[1] || 0);
                                        const minutes = parseInt(iso8601Match[2] || 0);
                                        const seconds = parseInt(iso8601Match[3] || 0);
                                        durationSeconds = hours * 3600 + minutes * 60 + seconds;
                                    } else {
                                        // Thử parse như số
                                        const num = parseInt(item.duration);
                                        if (!isNaN(num)) durationSeconds = num;
                                    }
                                } else if (typeof item.duration === 'number') {
                                    durationSeconds = item.duration;
                                }
                            }
                            // Thử timeRequired (schema.org)
                            else if (item.timeRequired) {
                                if (typeof item.timeRequired === 'string') {
                                    const timeMatch = item.timeRequired.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
                                    if (timeMatch) {
                                        const hours = parseInt(timeMatch[1] || 0);
                                        const minutes = parseInt(timeMatch[2] || 0);
                                        const seconds = parseInt(timeMatch[3] || 0);
                                        durationSeconds = hours * 3600 + minutes * 60 + seconds;
                                    }
                                }
                            }
                            
                            // Xác định type của lecture
                            let lectureType = 'LECTURE';
                            const itemType = item['@type'] || item.type || '';
                            if (itemType.includes('Video') || itemType.includes('video')) {
                                lectureType = 'VIDEO_LECTURE';
                            } else if (itemType.includes('Article') || itemType.includes('article')) {
                                lectureType = 'ARTICLE_LECTURE';
                            } else if (itemType.includes('Quiz') || itemType.includes('quiz')) {
                                lectureType = 'QUIZ_LECTURE';
                            }
                            
                            // Lấy thumbnail/image
                            let thumbnail = null;
                            if (item.image) {
                                thumbnail = typeof item.image === 'string' ? item.image : (item.image.url || item.image['@id'] || null);
                            } else if (item.thumbnail) {
                                thumbnail = typeof item.thumbnail === 'string' ? item.thumbnail : (item.thumbnail.url || null);
                            }
                            
                            const lectureData = {
                                lecture_id: item.id || item['@id'] || String(sectionIndex) + '_' + String(lectureIndex),
                                lecture_index: lectureIndex + 1,
                                title: item.name || item.title || item.headline || item.text || '',
                                type: lectureType,
                                duration_seconds: durationSeconds,
                                is_previewable: item.isPreviewable || item.previewable || false,
                                thumbnail: thumbnail,
                                url_landing: item.url || item.urlLanding || item.mainEntityOfPage || '',
                                url_enroll: item.urlAutoEnroll || '',
                                ai_summary: item.aiSummary || item.description || null
                            };
                            
                            sectionData.lectures.push(lectureData);
                            curriculum.total_lectures++;
                            curriculum.total_duration_seconds += durationSeconds;
                        });
                    }
                    
                    // Cập nhật lecture_count từ thực tế
                    if (sectionData.lectures.length > 0) {
                        sectionData.lecture_count = sectionData.lectures.length;
                    }
                    
                    curriculum.sections.push(sectionData);
                });
                
                curriculum.total_sections = curriculum.sections.length;
                
                // Nếu đã tìm thấy curriculum, dừng lại
                if (curriculum.total_sections > 0) {
                    return false; // break loop
                }
            }
            
        } catch (e) {
            // Log lỗi nhưng tiếp tục với script tiếp theo
            console.log(`  ⚠️  Lỗi parse JSON-LD script ${i + 1}: ${e.message}`);
        }
    });
    
    if (curriculum.total_sections > 0) {
        return curriculum;
    }
    
    return null;
}

/**
 * Tìm và parse curriculum từ script tags (có thể chứa đầy đủ sections kể cả bị ẩn)
 */
function extractCurriculumFromScriptTags($, html) {
    const curriculum = {
        total_sections: 0,
        total_lectures: 0,
        total_duration_seconds: 0,
        sections: []
    };
    
    // Tìm script tags chứa curriculum
    let foundScript = null;
    let foundScriptIndex = -1;
    $('script').each((i, elem) => {
        const content = $(elem).html();
        if (content && (content.includes('curriculum') || content.includes('sections')) && 
            (content.includes('items') || content.includes('lecture'))) {
            // Ưu tiên script lớn hơn (có nhiều data hơn) và có chứa "Bài 10" hoặc "Bài 11" (sections 11-16)
            const hasSections10_16 = content.includes('Bài 10') || content.includes('Bài 11') || content.includes('Bài 15');
            if (!foundScript || (hasSections10_16 && content.length > foundScript.length) || 
                (!foundScript.includes('Bài 10') && content.length > foundScript.length)) {
                foundScript = content;
                foundScriptIndex = i;
            }
        }
    });
    
    // Nếu không tìm thấy trong script tags, tìm trực tiếp trong HTML string
    if (!foundScript) {
        // Tìm pattern trong HTML thô
        if (html.includes('curriculum') && html.includes('sections')) {
            foundScript = html; // Sử dụng toàn bộ HTML để tìm
        }
    }
    
    if (!foundScript) {
        return null; // Không tìm thấy, return null để thử cách khác
    }
    
    // Thử parse từ script tag 45 (__next_f.push format) - có thể chứa đầy đủ sections
    try {
        // Tìm script tag 45 hoặc script tag lớn chứa curriculum
        const scripts = $('script').toArray();
        let script45Content = null;
        
        // Tìm script tag có chứa "curriculum" và "sections" và "Bài 10" hoặc "Bài 11"
        for (let i = 0; i < scripts.length; i++) {
            const scriptContent = $(scripts[i]).html();
            if (scriptContent && scriptContent.length > 50000 && 
                scriptContent.includes('curriculum') && 
                scriptContent.includes('sections') &&
                (scriptContent.includes('Bài 10') || scriptContent.includes('Bài 11') || scriptContent.length > 70000)) {
                script45Content = scriptContent;
                break;
            }
        }
        
        if (script45Content) {
            // Tìm "sections" trong script content
            const sectionsIndex = script45Content.indexOf('sections');
            if (sectionsIndex > 0) {
                // Tìm "[" sau "sections"
                const arrayStart = script45Content.indexOf('[', sectionsIndex);
                if (arrayStart > sectionsIndex) {
                    // Tìm đến hết sections array bằng cách đếm brackets
                    let bracketCount = 1; // Bắt đầu với 1 vì đã bỏ qua "["
                    let inString = false;
                    let escapeNext = false;
                    let endPos = -1;
                    
                    for (let i = arrayStart + 1; i < script45Content.length && i < arrayStart + 1000000; i++) {
                        const char = script45Content[i];
                        
                        if (escapeNext) {
                            escapeNext = false;
                            continue;
                        }
                        
                        if (char === '\\') {
                            escapeNext = true;
                            continue;
                        }
                        
                        if (char === '"') {
                            inString = !inString;
                            continue;
                        }
                        
                        if (!inString) {
                            if (char === '[') bracketCount++;
                            if (char === ']') {
                                bracketCount--;
                                if (bracketCount === 0) {
                                    endPos = i + 1;
                                    break;
                                }
                            }
                        }
                    }
                    
                    if (endPos > arrayStart) {
                        let sectionsStr = script45Content.substring(arrayStart, endPos);
                        // Unescape (thứ tự quan trọng!)
                        sectionsStr = sectionsStr.replace(/\\\\/g, 'TEMP_BACKSLASH')
                                                .replace(/\\"/g, '"')
                                                .replace(/TEMP_BACKSLASH/g, '\\')
                                                .replace(/\\n/g, '\n')
                                                .replace(/\\r/g, '\r')
                                                .replace(/\\t/g, '\t')
                                                .replace(/\\u([0-9a-fA-F]{4})/g, (m, code) => String.fromCharCode(parseInt(code, 16)));
                        
                        try {
                            const sections = JSON.parse(sectionsStr);
                                
                            if (Array.isArray(sections) && sections.length >= 16) {
                                // Reset curriculum để lấy đầy đủ
                                curriculum.total_sections = 0;
                                curriculum.total_lectures = 0;
                                curriculum.total_duration_seconds = 0;
                                curriculum.sections = [];
                                
                                sections.forEach((section, sectionIndex) => {
                                    const sectionData = {
                                        section_id: section.id || String(sectionIndex),
                                        section_index: sectionIndex + 1,
                                        title: section.title || '',
                                        description: section.description || '',
                                        type: section.type || 'COURSE_SECTION',
                                        lecture_count: section.lectureCount || (section.items?.length || 0),
                                        content_length_seconds: section.contentLength || 0,
                                        lectures: []
                                    };
                                    
                                    if (section.items && Array.isArray(section.items)) {
                                        section.items.forEach((lecture, lectureIndex) => {
                                            const lectureData = {
                                                lecture_id: lecture.id || String(sectionIndex) + '_' + String(lectureIndex),
                                                lecture_index: lectureIndex + 1,
                                                title: lecture.title || '',
                                                type: lecture.type || 'LECTURE',
                                                duration_seconds: lecture.durationInSeconds || 0,
                                                is_previewable: lecture.isPreviewable || false,
                                                thumbnail: lecture.thumbnail || lecture.images?.thumbnail || null,
                                                url_landing: lecture.urlLanding || '',
                                                url_enroll: lecture.urlAutoEnroll || '',
                                                ai_summary: lecture.aiSummary || null
                                            };
                                            
                                            sectionData.lectures.push(lectureData);
                                            curriculum.total_lectures++;
                                            curriculum.total_duration_seconds += lectureData.duration_seconds;
                                        });
                                    }
                                    
                                    curriculum.sections.push(sectionData);
                                });
                                
                                curriculum.total_sections = curriculum.sections.length;
                                
                                if (curriculum.total_sections >= 16) {
                                    return curriculum; // Trả về ngay khi tìm thấy đầy đủ
                                }
                            }
                        } catch (e) {
                            // Ignore parse errors
                        }
                    }
                }
            }
        }
        
        // Thử với __next_f.push format nếu chưa tìm thấy
        const nextFPattern = /self\.__next_f\.push\(\[1,"([\s\S]+?)"\]\)/g;
        const nextFMatches = [];
        let match;
        while ((match = nextFPattern.exec(foundScript)) !== null) {
            nextFMatches.push(match);
        }
        
        if (nextFMatches && nextFMatches.length > 0) {
            for (const match of nextFMatches) {
                if (!match || !match[1]) continue;
                
                let jsonString = match[1];
                
                // Unescape JSON string
                jsonString = jsonString.replace(/\\"/g, '"')
                                     .replace(/\\\\/g, '\\')
                                     .replace(/\\n/g, '\n')
                                     .replace(/\\r/g, '\r')
                                     .replace(/\\t/g, '\t')
                                     .replace(/\\u([0-9a-fA-F]{4})/g, (m, code) => String.fromCharCode(parseInt(code, 16)));
                
                if (jsonString.includes('"curriculum"') && jsonString.includes('"sections"')) {
                    try {
                        const data = JSON.parse(jsonString);
                        // Tìm curriculum trong nested structure
                        const findCurriculum = (obj) => {
                            if (typeof obj !== 'object' || obj === null) return null;
                            
                            if (obj.course && obj.course.curriculum && obj.course.curriculum.sections) {
                                return obj.course.curriculum;
                            }
                            
                            if (obj.curriculum && obj.curriculum.sections) {
                                return obj.curriculum;
                            }
                            
                            // Recursively search
                            for (const key in obj) {
                                if (typeof obj[key] === 'object' && obj[key] !== null) {
                                    const found = findCurriculum(obj[key]);
                                    if (found) return found;
                                }
                            }
                            
                            return null;
                        };
                        
                        const curriculumData = findCurriculum(data);
                        
                        if (curriculumData && curriculumData.sections && Array.isArray(curriculumData.sections)) {
                            // Parse sections - chỉ lấy nếu có nhiều sections hơn hiện tại
                            if (curriculumData.sections.length > curriculum.total_sections) {
                                // Reset curriculum để lấy đầy đủ
                                curriculum.total_sections = 0;
                                curriculum.total_lectures = 0;
                                curriculum.total_duration_seconds = 0;
                                curriculum.sections = [];
                                
                                curriculumData.sections.forEach((section, sectionIndex) => {
                                    const sectionData = {
                                        section_id: section.id || String(sectionIndex),
                                        section_index: sectionIndex + 1,
                                        title: section.title || '',
                                        description: section.description || '',
                                        type: section.type || 'COURSE_SECTION',
                                        lecture_count: section.lectureCount || (section.items?.length || 0),
                                        content_length_seconds: section.contentLength || 0,
                                        lectures: []
                                    };
                                    
                                    if (section.items && Array.isArray(section.items)) {
                                        section.items.forEach((lecture, lectureIndex) => {
                                            const lectureData = {
                                                lecture_id: lecture.id || String(sectionIndex) + '_' + String(lectureIndex),
                                                lecture_index: lectureIndex + 1,
                                                title: lecture.title || '',
                                                type: lecture.type || 'LECTURE',
                                                duration_seconds: lecture.durationInSeconds || 0,
                                                is_previewable: lecture.isPreviewable || false,
                                                thumbnail: lecture.thumbnail || lecture.images?.thumbnail || null,
                                                url_landing: lecture.urlLanding || '',
                                                url_enroll: lecture.urlAutoEnroll || '',
                                                ai_summary: lecture.aiSummary || null
                                            };
                                            
                                            sectionData.lectures.push(lectureData);
                                            curriculum.total_lectures++;
                                            curriculum.total_duration_seconds += lectureData.duration_seconds;
                                        });
                                    }
                                    
                                    curriculum.sections.push(sectionData);
                                });
                                
                                curriculum.total_sections = curriculum.sections.length;
                                
                                if (curriculum.total_sections > 0) {
                                    return curriculum; // Trả về ngay khi tìm thấy đầy đủ
                                }
                            }
                        }
                    } catch (e) {
                        // Ignore parse errors, tiếp tục thử
                    }
                }
            }
        }
    } catch (e) {
        // Ignore errors, tiếp tục với cách khác
    }
    
    // Thử parse trực tiếp từ script content
    // Tìm pattern trong HTML string: tìm "curriculum":{"sections":[...]
    try {
        // Tìm trong HTML string (không phải script content) vì có thể đã được escape
        const curriculumMatch = html.match(/"curriculum":\s*\{[\s\S]{100,100000}"sections":\s*\[[\s\S]{100,50000}\]/);
        
        if (curriculumMatch) {
            // Tìm từ "curriculum" đến hết sections array
            const curriculumStart = html.indexOf(curriculumMatch[0]);
            if (curriculumStart >= 0) {
                // Tìm đến hết curriculum object (sau "contentCounts")
                const contentCountsPos = html.indexOf('"contentCounts":', curriculumStart);
                if (contentCountsPos > curriculumStart) {
                    // Tìm closing brace sau contentCounts
                    let braceCount = 0;
                    let inString = false;
                    let escapeNext = false;
                    let endPos = -1;
                    
                    // Tìm opening brace của curriculum
                    let startPos = curriculumStart;
                    for (let i = curriculumStart; i < html.length && i < curriculumStart + 50; i++) {
                        if (html[i] === '{' && !inString) {
                            startPos = i;
                            break;
                        }
                        if (html[i] === '"' && !escapeNext) inString = !inString;
                        if (html[i] === '\\') escapeNext = !escapeNext; else escapeNext = false;
                    }
                    
                    // Đếm braces
                    for (let i = startPos; i < html.length && i < startPos + 100000; i++) {
                        const char = html[i];
                        
                        if (escapeNext) {
                            escapeNext = false;
                            continue;
                        }
                        
                        if (char === '\\') {
                            escapeNext = true;
                            continue;
                        }
                        
                        if (char === '"') {
                            inString = !inString;
                            continue;
                        }
                        
                        if (!inString) {
                            if (char === '{') braceCount++;
                            if (char === '}') {
                                braceCount--;
                                if (i > contentCountsPos && braceCount === 0) {
                                    endPos = i + 1;
                                    break;
                                }
                            }
                        }
                    }
                    
                    if (endPos > startPos) {
                        let jsonStr = html.substring(startPos, endPos);
                        // Unescape
                        jsonStr = jsonStr.replace(/\\"/g, '"')
                                        .replace(/\\n/g, '\n')
                                        .replace(/\\r/g, '\r')
                                        .replace(/\\t/g, '\t')
                                        .replace(/\\u([0-9a-fA-F]{4})/g, (m, code) => String.fromCharCode(parseInt(code, 16)));
                        
                        const curriculumObj = JSON.parse(jsonStr);
                        
                        if (curriculumObj.sections && Array.isArray(curriculumObj.sections)) {
                            curriculumObj.sections.forEach((section, sectionIndex) => {
                                const sectionData = {
                                    section_id: section.id || String(sectionIndex),
                                    section_index: sectionIndex + 1,
                                    title: section.title || '',
                                    description: section.description || '',
                                    type: section.type || 'COURSE_SECTION',
                                    lecture_count: section.lectureCount || (section.items?.length || 0),
                                    content_length_seconds: section.contentLength || 0,
                                    lectures: []
                                };
                                
                                if (section.items && Array.isArray(section.items)) {
                                    section.items.forEach((lecture, lectureIndex) => {
                                        const lectureData = {
                                            lecture_id: lecture.id || String(sectionIndex) + '_' + String(lectureIndex),
                                            lecture_index: lectureIndex + 1,
                                            title: lecture.title || '',
                                            type: lecture.type || 'LECTURE',
                                            duration_seconds: lecture.durationInSeconds || 0,
                                            is_previewable: lecture.isPreviewable || false,
                                            thumbnail: lecture.thumbnail || lecture.images?.thumbnail || null,
                                            url_landing: lecture.urlLanding || '',
                                            url_enroll: lecture.urlAutoEnroll || '',
                                            ai_summary: lecture.aiSummary || null
                                        };
                                        
                                        sectionData.lectures.push(lectureData);
                                        curriculum.total_lectures++;
                                        curriculum.total_duration_seconds += lectureData.duration_seconds;
                                    });
                                }
                                
                                curriculum.sections.push(sectionData);
                            });
                            
                            curriculum.total_sections = curriculum.sections.length;
                            
                            if (curriculum.total_sections > 0) {
                                return curriculum;
                            }
                        }
                    }
                }
            }
        }
    } catch (e) {
        // Ignore parse errors, tiếp tục thử cách khác
    }
    
    // Thử parse từ __next_f format - tìm trong tất cả script tags
    const allScripts = [];
    $('script').each((i, elem) => {
        const content = $(elem).html();
        if (content && content.length > 1000) { // Chỉ xét script lớn
            allScripts.push(content);
        }
    });
    
    // Thêm HTML string vào danh sách để tìm
    if (html && html.length > foundScript.length) {
        allScripts.push(html);
    }
    
    // Tìm trong tất cả scripts
    for (const scriptContent of allScripts) {
        // Tìm __next_f.push format
        const nextFMatches = scriptContent.match(/self\.__next_f\.push\(\[1,"([^"]+)"\]\)/g);
        if (nextFMatches) {
            for (const match of nextFMatches) {
                const stringMatch = match.match(/self\.__next_f\.push\(\[1,"([^"]+)"\]\)/);
                if (!stringMatch) continue;
                
                let jsonString = stringMatch[1];
                
                // Unescape JSON string
                jsonString = jsonString.replace(/\\"/g, '"')
                                     .replace(/\\\\/g, '\\')
                                     .replace(/\\n/g, '\n')
                                     .replace(/\\r/g, '\r')
                                     .replace(/\\t/g, '\t');
                
                // Tìm phần chứa curriculum
                if (jsonString.includes('"curriculum"') || jsonString.includes('"sections"')) {
                    try {
                        // Thử parse toàn bộ
                        const data = JSON.parse(jsonString);
                        
                        // Tìm curriculum trong nested structure
                        const findCurriculum = (obj) => {
                            if (typeof obj !== 'object' || obj === null) return null;
                            
                            if (obj.curriculum && obj.curriculum.sections && Array.isArray(obj.curriculum.sections)) {
                                return obj.curriculum;
                            }
                            
                            if (obj.course && obj.course.curriculum && Array.isArray(obj.course.curriculum.sections)) {
                                return obj.course.curriculum;
                            }
                            
                            // Recursively search
                            for (const key in obj) {
                                if (typeof obj[key] === 'object') {
                                    const found = findCurriculum(obj[key]);
                                    if (found) return found;
                                }
                            }
                            
                            return null;
                        };
                        
                        const curriculumData = findCurriculum(data);
                        
                        if (curriculumData && curriculumData.sections && Array.isArray(curriculumData.sections)) {
                            // Parse sections - chỉ lấy nếu có nhiều sections hơn hiện tại
                            if (curriculumData.sections.length > curriculum.total_sections) {
                                // Reset curriculum để lấy đầy đủ
                                curriculum.total_sections = 0;
                                curriculum.total_lectures = 0;
                                curriculum.total_duration_seconds = 0;
                                curriculum.sections = [];
                                
                                curriculumData.sections.forEach((section, sectionIndex) => {
                                    const sectionData = {
                                        section_id: section.id || String(sectionIndex),
                                        section_index: sectionIndex + 1,
                                        title: section.title || '',
                                        description: section.description || '',
                                        type: section.type || 'COURSE_SECTION',
                                        lecture_count: section.lectureCount || (section.items?.length || 0),
                                        content_length_seconds: section.contentLength || 0,
                                        lectures: []
                                    };
                                    
                                    if (section.items && Array.isArray(section.items)) {
                                        section.items.forEach((lecture, lectureIndex) => {
                                            const lectureData = {
                                                lecture_id: lecture.id || String(sectionIndex) + '_' + String(lectureIndex),
                                                lecture_index: lectureIndex + 1,
                                                title: lecture.title || '',
                                                type: lecture.type || 'LECTURE',
                                                duration_seconds: lecture.durationInSeconds || 0,
                                                is_previewable: lecture.isPreviewable || false,
                                                thumbnail: lecture.thumbnail || lecture.images?.thumbnail || null,
                                                url_landing: lecture.urlLanding || '',
                                                url_enroll: lecture.urlAutoEnroll || '',
                                                ai_summary: lecture.aiSummary || null
                                            };
                                            
                                            sectionData.lectures.push(lectureData);
                                            curriculum.total_lectures++;
                                            curriculum.total_duration_seconds += lectureData.duration_seconds;
                                        });
                                    }
                                    
                                    curriculum.sections.push(sectionData);
                                });
                                
                                curriculum.total_sections = curriculum.sections.length;
                                
                                if (curriculum.total_sections > 0) {
                                    return curriculum; // Trả về ngay khi tìm thấy đầy đủ
                                }
                            }
                        }
                    } catch (e) {
                        // Ignore parse errors, tiếp tục thử
                    }
                }
            }
        }
    }
    
    // Thử tìm trực tiếp trong HTML string với pattern "course":{..."curriculum":{"sections":[...]
    // Tìm pattern với escaped quotes
    const coursePattern = /"course":\s*\{[\s\S]*?"curriculum":\s*\{[\s\S]*?"sections":\s*\[([\s\S]*?)\][\s\S]*?"contentCounts"/;
    const courseMatch = html.match(coursePattern);
    
    if (courseMatch) {
        try {
            // Tìm từ vị trí "course" đến hết curriculum object
            const courseStart = html.indexOf('"course":');
            if (courseStart !== -1) {
                // Tìm đến hết curriculum object bằng cách đếm braces
                let braceCount = 0;
                let inString = false;
                let escapeNext = false;
                let courseEnd = -1;
                
                for (let i = courseStart; i < html.length; i++) {
                    const char = html[i];
                    
                    if (escapeNext) {
                        escapeNext = false;
                        continue;
                    }
                    
                    if (char === '\\') {
                        escapeNext = true;
                        continue;
                    }
                    
                    if (char === '"') {
                        inString = !inString;
                        continue;
                    }
                    
                    if (!inString) {
                        if (char === '{') braceCount++;
                        if (char === '}') {
                            braceCount--;
                            // Nếu đã đóng hết và gặp "contentCounts" thì đây là kết thúc curriculum
                            if (braceCount === 0 && html.substring(i-30, i).includes('contentCounts')) {
                                courseEnd = i + 1;
                                break;
                            }
                        }
                    }
                }
                
                if (courseEnd > courseStart) {
                    let courseJson = html.substring(courseStart, courseEnd);
                    // Unescape
                    courseJson = courseJson.replace(/\\"/g, '"')
                                          .replace(/\\n/g, '\n')
                                          .replace(/\\r/g, '\r')
                                          .replace(/\\t/g, '\t')
                                          .replace(/\\u([0-9a-fA-F]{4})/g, (m, code) => String.fromCharCode(parseInt(code, 16)));
                    
                    // Parse course object
                    const courseObj = JSON.parse('{' + courseJson + '}');
                    
                    if (courseObj.course && courseObj.course.curriculum && courseObj.course.curriculum.sections) {
                        const sections = courseObj.course.curriculum.sections;
                        
                        sections.forEach((section, sectionIndex) => {
                            const sectionData = {
                                section_id: section.id || String(sectionIndex),
                                section_index: sectionIndex + 1,
                                title: section.title || '',
                                description: section.description || '',
                                type: section.type || 'COURSE_SECTION',
                                lecture_count: section.lectureCount || (section.items?.length || 0),
                                content_length_seconds: section.contentLength || 0,
                                lectures: []
                            };
                            
                            if (section.items && Array.isArray(section.items)) {
                                section.items.forEach((lecture, lectureIndex) => {
                                    const lectureData = {
                                        lecture_id: lecture.id || String(sectionIndex) + '_' + String(lectureIndex),
                                        lecture_index: lectureIndex + 1,
                                        title: lecture.title || '',
                                        type: lecture.type || 'LECTURE',
                                        duration_seconds: lecture.durationInSeconds || 0,
                                        is_previewable: lecture.isPreviewable || false,
                                        thumbnail: lecture.thumbnail || lecture.images?.thumbnail || null,
                                        url_landing: lecture.urlLanding || '',
                                        url_enroll: lecture.urlAutoEnroll || '',
                                        ai_summary: lecture.aiSummary || null
                                    };
                                    
                                    sectionData.lectures.push(lectureData);
                                    curriculum.total_lectures++;
                                    curriculum.total_duration_seconds += lectureData.duration_seconds;
                                });
                            }
                            
                            curriculum.sections.push(sectionData);
                        });
                        
                        curriculum.total_sections = curriculum.sections.length;
                        
                        if (curriculum.total_sections > 0) {
                            return curriculum;
                        }
                    }
                }
            }
        } catch (e) {
            // Ignore parse errors
        }
    }
    
    return null; // Không tìm thấy trong script tags
}

/**
 * Normalize title để so sánh (bỏ dấu, lowercase, trim)
 */
function normalizeTitle(title) {
    if (!title) return '';
    return title.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Bỏ dấu tiếng Việt
        .replace(/[^\w\s]/g, '') // Bỏ ký tự đặc biệt
        .trim();
}

/**
 * Tính độ tương đồng giữa 2 titles (0-1)
 */
function titleSimilarity(title1, title2) {
    const norm1 = normalizeTitle(title1);
    const norm2 = normalizeTitle(title2);
    
    if (norm1 === norm2) return 1.0;
    if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.8;
    
    // Levenshtein distance đơn giản
    const longer = norm1.length > norm2.length ? norm1 : norm2;
    const shorter = norm1.length > norm2.length ? norm2 : norm1;
    if (longer.length === 0) return 1.0;
    
    const distance = levenshteinDistance(norm1, norm2);
    return 1 - (distance / longer.length);
}

/**
 * Tính Levenshtein distance
 */
function levenshteinDistance(str1, str2) {
    const matrix = [];
    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[str2.length][str1.length];
}

/**
 * Merge lectures từ curriculum khác vào sections của curriculum hiện tại
 * Match sections theo title hoặc index
 */
function mergeLecturesIntoCurriculum(targetCurriculum, sourceCurriculum) {
    if (!targetCurriculum || !sourceCurriculum || !sourceCurriculum.sections) {
        return targetCurriculum;
    }
    
    // Nếu target đã có lectures đầy đủ, không cần merge
    const targetHasLectures = targetCurriculum.sections.some(s => s.lectures && s.lectures.length > 0);
    if (targetHasLectures) {
        return targetCurriculum;
    }
    
    // Tạo map để match sections: targetIndex -> sourceSection
    const sectionMap = new Map();
    const usedSourceIndices = new Set();
    
    // 1. Title-based matching (ưu tiên) - tìm match tốt nhất
    targetCurriculum.sections.forEach((targetSection, targetIndex) => {
        if (targetSection.lectures && targetSection.lectures.length > 0) {
            return; // Đã có lectures, bỏ qua
        }
        
        const targetTitle = targetSection.title || '';
        let bestMatch = null;
        let bestScore = 0;
        let bestSourceIndex = -1;
        
        sourceCurriculum.sections.forEach((sourceSection, sourceIndex) => {
            if (usedSourceIndices.has(sourceIndex)) return;
            if (!sourceSection.lectures || sourceSection.lectures.length === 0) return;
            
            const sourceTitle = sourceSection.title || '';
            const similarity = titleSimilarity(targetTitle, sourceTitle);
            
            if (similarity > bestScore && similarity > 0.5) { // Threshold 0.5
                bestScore = similarity;
                bestMatch = sourceSection;
                bestSourceIndex = sourceIndex;
            }
        });
        
        if (bestMatch) {
            sectionMap.set(targetIndex, bestMatch);
            usedSourceIndices.add(bestSourceIndex);
        }
    });
    
    // 2. Index-based matching cho các sections chưa match
    targetCurriculum.sections.forEach((targetSection, targetIndex) => {
        if (sectionMap.has(targetIndex)) return; // Đã match
        if (targetSection.lectures && targetSection.lectures.length > 0) return;
        
        // Tìm source section theo index
        if (targetIndex < sourceCurriculum.sections.length) {
            const sourceSection = sourceCurriculum.sections[targetIndex];
            if (sourceSection.lectures && sourceSection.lectures.length > 0 && !usedSourceIndices.has(targetIndex)) {
                sectionMap.set(targetIndex, sourceSection);
                usedSourceIndices.add(targetIndex);
            }
        }
    });
    
    // Merge lectures
    let totalLecturesAdded = 0;
    
    sectionMap.forEach((sourceSection, targetIndex) => {
        const targetSection = targetCurriculum.sections[targetIndex];
        if (sourceSection.lectures && sourceSection.lectures.length > 0) {
            targetSection.lectures = sourceSection.lectures.map((lecture, idx) => ({
                ...lecture,
                lecture_index: idx + 1
            }));
            targetSection.lecture_count = targetSection.lectures.length;
            
            const sectionDuration = targetSection.lectures.reduce((sum, l) => sum + (l.duration_seconds || 0), 0);
            if (sectionDuration > 0) {
                targetSection.content_length_seconds = sectionDuration;
            }
            
            totalLecturesAdded += targetSection.lectures.length;
        }
    });
    
    // Cập nhật tổng số
    targetCurriculum.total_lectures = targetCurriculum.sections.reduce((sum, s) => sum + (s.lectures?.length || 0), 0);
    targetCurriculum.total_duration_seconds = targetCurriculum.sections.reduce((sum, s) => sum + (s.content_length_seconds || 0), 0);
    
    return targetCurriculum;
}

/**
 * Trích xuất curriculum từ HTML DOM (chỉ các sections đang hiển thị)
 */
function extractCurriculumFromHTML($) {
    const curriculum = {
        total_sections: 0,
        total_lectures: 0,
        total_duration_seconds: 0,
        sections: []
    };
    
    // Tìm container curriculum - thử nhiều selector
    let curriculumContainer = $('div[data-purpose="course-curriculum"]');
    if (curriculumContainer.length === 0) {
        curriculumContainer = $('[data-purpose="course-curriculum"]');
    }
    if (curriculumContainer.length === 0) {
        curriculumContainer = $('.course-curriculum, .curriculum, [class*="curriculum"]');
    }
    if (curriculumContainer.length === 0) {
        return curriculum;
    }
    
    // Tìm tất cả sections (bao gồm cả những cái bị ẩn)
    // Thử nhiều selector khác nhau
    let sectionPanels = curriculumContainer.find('.curriculum-section-module-scss-module__9JCrHq__panel');
    if (sectionPanels.length === 0) {
        sectionPanels = curriculumContainer.find('[class*="section"][class*="panel"]');
    }
    if (sectionPanels.length === 0) {
        sectionPanels = curriculumContainer.find('div[data-purpose="section"]');
    }
    if (sectionPanels.length === 0) {
        sectionPanels = curriculumContainer.find('div[class*="section"]');
    }
    
    sectionPanels.each((sectionIndex, sectionElem) => {
        const $section = $(sectionElem);
        
        // Lấy section title
        const sectionTitle = $section.find('.curriculum-section-module-scss-module__9JCrHq__section-title').first().text().trim();
        
        // Lấy section stats
        const statsText = $section.find('[data-purpose="section-content-stats"]').first().text().trim();
        const lectureCountMatch = statsText.match(/(\d+)\s*lectures?/i);
        const lectureCount = lectureCountMatch ? parseInt(lectureCountMatch[1]) : 0;
        
        // Lấy duration từ stats
        const durationMatch = statsText.match(/(\d+(?:\s*hr|h)?\s*\d*(?:\s*min|m)?)/i);
        const sectionDuration = durationMatch ? durationMatch[0] : '';
        
        const sectionData = {
            section_id: String(sectionIndex),
            section_index: sectionIndex + 1,
            title: sectionTitle,
            description: '',
            type: 'COURSE_SECTION',
            lecture_count: lectureCount,
            content_length_seconds: parseDurationToSeconds(sectionDuration),
            lectures: []
        };
        
        // Tìm tất cả lectures trong section - thử nhiều selector
        let lectureItems = $section.find('ul.ud-unstyled-list li');
        if (lectureItems.length === 0) {
            lectureItems = $section.find('li[data-purpose="lecture"]');
        }
        if (lectureItems.length === 0) {
            lectureItems = $section.find('[class*="lecture"]');
        }
        if (lectureItems.length === 0) {
            lectureItems = $section.find('li');
        }
        if (lectureItems.length === 0) {
            lectureItems = $section.find('[data-purpose*="lecture"], [data-purpose*="item"]');
        }
        
        lectureItems.each((lectureIndex, lectureElem) => {
            const $lecture = $(lectureElem);
            
            // Lấy lecture title - thử nhiều selector
            let lectureTitle = $lecture.find('.curriculum-section-module-scss-module__9JCrHq__course-lecture-title').first().text().trim();
            if (!lectureTitle) {
                lectureTitle = $lecture.find('[class*="lecture-title"], [class*="course-lecture"]').first().text().trim();
            }
            if (!lectureTitle) {
                lectureTitle = $lecture.find('a, span, div').filter((i, el) => {
                    const text = $(el).text().trim();
                    return text.length > 5 && text.length < 200;
                }).first().text().trim();
            }
            if (!lectureTitle) {
                lectureTitle = $lecture.text().trim().split('\n')[0].trim();
            }
            
            // Bỏ qua nếu không có title
            if (!lectureTitle || lectureTitle.length < 3) {
                return;
            }
            
            // Lấy duration - thử nhiều selector
            let durationText = $lecture.find('.curriculum-section-module-scss-module__9JCrHq__item-content-summary span').first().text().trim();
            if (!durationText) {
                durationText = $lecture.find('[class*="duration"], [class*="time"], [class*="length"]').first().text().trim();
            }
            if (!durationText) {
                durationText = $lecture.find('span, div').filter((i, el) => {
                    const text = $(el).text().trim();
                    return /^\d+/.test(text) && (text.includes('min') || text.includes('sec') || text.includes(':'));
                }).first().text().trim();
            }
            const durationSeconds = parseDurationToSeconds(durationText);
            
            // Xác định type (video hoặc article) - thử nhiều cách
            const iconHref = $lecture.find('svg use').attr('xlink:href') || $lecture.find('svg use').attr('href') || '';
            const iconClass = $lecture.find('svg, [class*="icon"]').attr('class') || '';
            let lectureType = 'LECTURE';
            if (iconHref.includes('icon-video') || iconHref.includes('video') || iconClass.includes('video')) {
                lectureType = 'VIDEO_LECTURE';
            } else if (iconHref.includes('icon-article') || iconHref.includes('article') || iconClass.includes('article')) {
                lectureType = 'ARTICLE_LECTURE';
            } else if ($lecture.find('[class*="video"], [data-purpose*="video"]').length > 0) {
                lectureType = 'VIDEO_LECTURE';
            } else if ($lecture.find('[class*="article"], [data-purpose*="article"]').length > 0) {
                lectureType = 'ARTICLE_LECTURE';
            }
            
            // Kiểm tra có preview không
            const hasPreview = $lecture.find('.curriculum-section-module-scss-module__9JCrHq__preview-text, [class*="preview"]').length > 0;
            
            const lectureData = {
                lecture_id: String(sectionIndex) + '_' + String(lectureIndex),
                lecture_index: lectureIndex + 1,
                title: lectureTitle,
                type: lectureType,
                duration_seconds: durationSeconds,
                is_previewable: hasPreview,
                thumbnail: null,
                url_landing: '',
                url_enroll: '',
                ai_summary: null
            };
            
            sectionData.lectures.push(lectureData);
            curriculum.total_lectures++;
            curriculum.total_duration_seconds += durationSeconds;
        });
        
        // Cập nhật lecture_count từ thực tế nếu không có trong stats
        if (sectionData.lecture_count === 0 && sectionData.lectures.length > 0) {
            sectionData.lecture_count = sectionData.lectures.length;
        }
        
        curriculum.sections.push(sectionData);
    });
    
    curriculum.total_sections = curriculum.sections.length;
    
    return curriculum;
}

/**
 * Trích xuất curriculum từ __NEXT_DATA__
 */
function extractCurriculumFromNextData(nextData) {
    const curriculum = {
        total_sections: 0,
        total_lectures: 0,
        total_duration_seconds: 0,
        sections: []
    };

    if (!nextData) {
        return curriculum;
    }

    // Các paths có thể chứa curriculum
    const paths = [
        ['props', 'pageProps', 'course', 'curriculum', 'sections'],
        ['props', 'pageProps', 'course', 'curriculum'],
        ['props', 'pageProps', 'course'],
        ['course', 'curriculum', 'sections'],
        ['course', 'curriculum'],
        ['curriculum', 'sections'],
        ['curriculum'],
        ['sections']
    ];

    let sections = null;
    let contentCounts = null;

    for (const path of paths) {
        let found = nextData;
        for (const key of path) {
            if (found && typeof found === 'object' && key in found) {
                found = found[key];
            } else {
                found = null;
                break;
            }
        }
        
        if (found) {
            if (Array.isArray(found)) {
                sections = found;
                break;
            } else if (found.sections && Array.isArray(found.sections)) {
                sections = found.sections;
                if (found.contentCounts) {
                    contentCounts = found.contentCounts;
                }
                break;
            } else if (found.curriculum) {
                if (found.curriculum.sections && Array.isArray(found.curriculum.sections)) {
                    sections = found.curriculum.sections;
                    if (found.curriculum.contentCounts) {
                        contentCounts = found.curriculum.contentCounts;
                    }
                    break;
                }
            } else if (found.contentCounts) {
                contentCounts = found.contentCounts;
            }
        }
    }

    if (sections && Array.isArray(sections)) {
        curriculum.total_sections = sections.length;
        
        sections.forEach((section, sectionIndex) => {
            const sectionData = {
                section_id: section.id || String(sectionIndex),
                section_index: sectionIndex + 1,
                title: section.title || '',
                description: section.description || '',
                type: section.type || 'COURSE_SECTION',
                lecture_count: section.lectureCount || (section.items?.length || 0),
                content_length_seconds: section.contentLength || 0,
                lectures: []
            };

            // Extract lectures trong section
            if (section.items && Array.isArray(section.items)) {
                section.items.forEach((lecture, lectureIndex) => {
                    const lectureData = {
                        lecture_id: lecture.id || String(lectureIndex),
                        lecture_index: lectureIndex + 1,
                        title: lecture.title || '',
                        type: lecture.type || 'LECTURE',
                        duration_seconds: lecture.durationInSeconds || 0,
                        is_previewable: lecture.isPreviewable || false,
                        thumbnail: lecture.thumbnail || lecture.images?.thumbnail || null,
                        url_landing: lecture.urlLanding || '',
                        url_enroll: lecture.urlAutoEnroll || '',
                        ai_summary: lecture.aiSummary || null
                    };

                    sectionData.lectures.push(lectureData);
                    curriculum.total_lectures++;
                    curriculum.total_duration_seconds += lectureData.duration_seconds;
                });
            }

            curriculum.sections.push(sectionData);
        });

        // Cập nhật từ contentCounts nếu có
        if (contentCounts) {
            curriculum.total_lectures = contentCounts.lecturesCount || curriculum.total_lectures;
        }
    }

    return curriculum;
}

/**
 * Lấy curriculum từ một URL
 */
/**
 * Get curriculum from course URL
 * @param {string|Object} urlOrOptions - Course URL or options object
 * @param {string} urlOrOptions.url - Course URL
 * @param {boolean} urlOrOptions.silent - Suppress console logs
 * @param {string} urlOrOptions.cookiesPath - Path to cookies file
 * @returns {Promise<Object>} - Curriculum data
 */
async function getCurriculumFromUrl(urlOrOptions, options = {}) {
    // Handle both old API (url, options) and new API (options object)
    let url, silent, cookiesPath;
    if (typeof urlOrOptions === 'string') {
        url = urlOrOptions;
        silent = options.silent || false;
        cookiesPath = options.cookiesPath || null;
    } else {
        url = urlOrOptions.url;
        silent = urlOrOptions.silent || false;
        cookiesPath = urlOrOptions.cookiesPath || null;
    }
    
    // Validate URL
    const validation = validateCourseUrl(url);
    if (!validation.valid) {
        throw new Error(`Invalid URL: ${validation.error}`);
    }
    const sanitizedUrl = validation.sanitized;
    
    const { gotScraping } = await import('got-scraping');
    const path = require('path');
    
    // Load cookies if path provided
    let cookies = '';
    if (cookiesPath) {
        try {
            const fullPath = path.isAbsolute(cookiesPath) 
                ? cookiesPath 
                : path.join(process.cwd(), cookiesPath);
            cookies = await fs.readFile(fullPath, 'utf-8');
        } catch (e) {
            // Cookies file not found, continue without cookies
            if (!silent) {
                console.warn('Cookies file not found, continuing without cookies');
            }
        }
    }
    
    if (!silent) {
        console.log(`\n📡 Đang fetch: ${sanitizedUrl}`);
    }
    
    try {
        const response = await gotScraping({
            url: sanitizedUrl,
            method: 'GET',
            http2: true,
            headers: { 
                'Cookie': cookies, 
                'Referer': sanitizedUrl,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: { request: 60000 }, // Tăng lên 60s để đảm bảo lấy đầy đủ lecture
            retry: {
                limit: 2,
                methods: ['GET'],
                statusCodes: [408, 413, 429, 500, 502, 503, 504]
            }
        });
        
        const $ = cheerio.load(response.body);
        
        // Tìm __NEXT_DATA__ - thử tìm trong script tag có id trước
        let nextData = null;
        const nextDataScript = $('script#__NEXT_DATA__').html();
        if (nextDataScript) {
            try {
                nextData = JSON.parse(nextDataScript);
                if (!silent) {
                    console.log('  ✅ Tìm thấy __NEXT_DATA__ script tag');
                }
            } catch (e) {
                if (!silent) {
                    console.log('  ⚠️  Lỗi parse __NEXT_DATA__ từ script#__NEXT_DATA__:', e.message);
                }
            }
        } else if (!silent) {
            console.log('  ⚠️  Không tìm thấy script#__NEXT_DATA__');
        }
        
        // Nếu không tìm thấy, tìm trong __next_f format trong HTML thô
        if (!nextData) {
            if (!silent) {
                console.log('  🔍 Đang tìm __NEXT_DATA__ trong HTML thô...');
            }
            const html = response.body;
            
            // Tìm script tag chứa course và curriculum (tìm pattern với escaped quotes)
            const scriptMatch = html.match(/<script[^>]*>([\s\S]*?\\"course\\":[\s\S]*?\\"curriculum\\":[\s\S]*?\\"sections\\"[\s\S]*?)<\/script>/);
            
            if (scriptMatch) {
                const scriptContent = scriptMatch[1];
                
                // Tìm vị trí bắt đầu của course object
                const courseStart = scriptContent.indexOf('"course":');
                if (courseStart !== -1) {
                    // Tìm từ vị trí course đến hết curriculum object
                    // Tìm "contentCounts" để biết kết thúc curriculum
                    let searchStart = courseStart;
                    let depth = 0;
                    let inString = false;
                    let escapeNext = false;
                    let courseEnd = -1;
                    
                    for (let i = searchStart; i < scriptContent.length; i++) {
                        const char = scriptContent[i];
                        
                        if (escapeNext) {
                            escapeNext = false;
                            continue;
                        }
                        
                        if (char === '\\') {
                            escapeNext = true;
                            continue;
                        }
                        
                        if (char === '"') {
                            inString = !inString;
                            continue;
                        }
                        
                        if (!inString) {
                            if (char === '{') depth++;
                            if (char === '}') {
                                depth--;
                                if (depth === 0 && scriptContent.substring(i-20, i).includes('contentCounts')) {
                                    courseEnd = i + 1;
                                    break;
                                }
                            }
                        }
                    }
                    
                    if (courseEnd > courseStart) {
                        try {
                            // Extract và unescape
                            let courseJson = scriptContent.substring(courseStart, courseEnd);
                            courseJson = courseJson.replace(/\\"/g, '"')
                                                  .replace(/\\n/g, '\n')
                                                  .replace(/\\r/g, '\r')
                                                  .replace(/\\t/g, '\t')
                                                  .replace(/\\u([0-9a-fA-F]{4})/g, (m, code) => String.fromCharCode(parseInt(code, 16)));
                            
                            // Parse course object
                            const courseObj = JSON.parse('{' + courseJson + '}');
                            
                            if (courseObj.course && courseObj.course.curriculum && courseObj.course.curriculum.sections) {
                                nextData = {
                                    props: {
                                        pageProps: {
                                            course: courseObj.course
                                        }
                                    }
                                };
                            }
                        } catch (e) {
                            // Ignore parse errors
                        }
                    }
                }
            }
            
            // Nếu vẫn chưa tìm thấy, tìm trong các script tags khác
            if (!nextData) {
                $('script').each((i, elem) => {
                    const scriptContent = $(elem).html();
                    if (!scriptContent) return;
                    
                    // Tìm script lớn có chứa curriculum
                    if (scriptContent.length > 100000 && scriptContent.includes('curriculum') && scriptContent.includes('sections')) {
                        try {
                            const data = JSON.parse(scriptContent);
                            if (data.curriculum || data.sections || (data.props && data.props.pageProps)) {
                                nextData = data;
                                return false; // break loop
                            }
                        } catch (e) {
                            // Ignore
                        }
                    }
                    
                    // Tìm __NEXT_DATA__ trong script content
                    if (scriptContent.includes('__NEXT_DATA__')) {
                        const nextDataMatch = scriptContent.match(/__NEXT_DATA__\s*=\s*({[\s\S]*?})(?:\s*;|\s*$)/);
                        if (nextDataMatch) {
                            try {
                                nextData = JSON.parse(nextDataMatch[1]);
                                return false; // break loop
                            } catch (e) {
                                // Ignore
                            }
                        }
                    }
                });
            }
        }
        
        let curriculum = null;
        
        // Ưu tiên 1: Tìm trong __NEXT_DATA__ (có thể chứa đầy đủ lectures cho tất cả sections)
        if (nextData) {
            if (!silent) {
                console.log('  🔍 Đang tìm curriculum trong __NEXT_DATA__...');
            }
            curriculum = extractCurriculumFromNextData(nextData);
            if (curriculum && curriculum.total_sections > 0) {
                const sectionsWithLectures = curriculum.sections.filter(s => s.lectures && s.lectures.length > 0).length;
                const totalLectures = curriculum.sections.reduce((sum, s) => sum + (s.lectures?.length || 0), 0);
                if (!silent) {
                    console.log(`  ✅ Tìm thấy ${curriculum.total_sections} sections từ __NEXT_DATA__ (${sectionsWithLectures}/${curriculum.total_sections} sections có lectures, tổng ${totalLectures} lectures)`);
                }
            } else if (!silent) {
                console.log('  ⚠️  Không tìm thấy curriculum trong __NEXT_DATA__');
            }
        }
        
        // Ưu tiên 1.5: Tìm trong JSON-LD (có thể chứa đầy đủ sections kể cả bị ẩn)
        let jsonLdCurriculum = null;
        if (!curriculum || curriculum.total_sections === 0) {
            console.log('  🔍 Đang tìm curriculum trong JSON-LD script tags...');
            jsonLdCurriculum = extractCurriculumFromJsonLd($);
            if (jsonLdCurriculum && jsonLdCurriculum.total_sections > 0) {
                curriculum = jsonLdCurriculum;
                const hasLectures = curriculum.sections.some(s => s.lectures && s.lectures.length > 0);
                if (hasLectures) {
                    console.log(`  ✅ Tìm thấy ${curriculum.total_sections} sections từ JSON-LD (đầy đủ với lectures)`);
                } else {
                    console.log(`  ✅ Tìm thấy ${curriculum.total_sections} sections từ JSON-LD (chưa có lectures, sẽ tìm từ nguồn khác)`);
                }
            }
        }
        
        // Ưu tiên 2: Tìm trong script tags (có thể chứa đầy đủ sections kể cả bị ẩn)
        let scriptCurriculum = null;
        if (!curriculum || curriculum.total_sections === 0) {
            console.log('  🔍 Đang tìm curriculum trong script tags...');
            scriptCurriculum = extractCurriculumFromScriptTags($, response.body);
            if (scriptCurriculum && scriptCurriculum.total_sections > 0) {
                curriculum = scriptCurriculum;
                const hasAllLectures = curriculum.sections.every(s => s.lectures && s.lectures.length > 0);
                if (hasAllLectures) {
                    console.log(`  ✅ Tìm thấy ${curriculum.total_sections} sections từ script tags (đầy đủ với lectures)`);
                } else {
                    console.log(`  ✅ Tìm thấy ${curriculum.total_sections} sections từ script tags (một số sections có lectures)`);
                }
            }
        } else {
            // Nếu đã có curriculum nhưng thiếu lectures, thử tìm từ script tags
            const sectionsWithoutLectures = curriculum.sections.filter(s => !s.lectures || s.lectures.length === 0).length;
            if (sectionsWithoutLectures > 0) {
                console.log(`  🔍 Còn ${sectionsWithoutLectures} sections chưa có lectures, đang tìm từ script tags...`);
                scriptCurriculum = extractCurriculumFromScriptTags($, response.body);
                if (scriptCurriculum && scriptCurriculum.total_sections > 0) {
                    curriculum = mergeLecturesIntoCurriculum(curriculum, scriptCurriculum);
                    const sectionsWithLectures = curriculum.sections.filter(s => s.lectures && s.lectures.length > 0).length;
                    console.log(`  ✅ Đã merge từ script tags: ${sectionsWithLectures}/${curriculum.total_sections} sections có lectures`);
                }
            }
        }
        
        // Ưu tiên 3: Tìm trong HTML DOM (chỉ các sections đang hiển thị) - chỉ dùng để bổ sung
        let htmlCurriculum = null;
        if (!curriculum || curriculum.total_sections === 0) {
            if (!silent) {
                console.log('  🔍 Đang tìm curriculum trong HTML DOM...');
            }
            htmlCurriculum = extractCurriculumFromHTML($);
            if (htmlCurriculum && htmlCurriculum.total_sections > 0) {
                curriculum = htmlCurriculum;
                const totalLectures = htmlCurriculum.sections.reduce((sum, s) => sum + (s.lectures?.length || 0), 0);
                if (!silent) {
                    console.log(`  ✅ Tìm thấy ${curriculum.total_sections} sections từ HTML DOM với ${totalLectures} lectures`);
                }
            }
        } else {
            // Nếu đã có curriculum nhưng vẫn thiếu lectures, thử bổ sung từ HTML DOM
            const sectionsWithoutLectures = curriculum.sections.filter(s => !s.lectures || s.lectures.length === 0).length;
            if (sectionsWithoutLectures > 0) {
                if (!silent) {
                    console.log(`  🔍 Còn ${sectionsWithoutLectures} sections chưa có lectures, đang tìm từ HTML DOM...`);
                }
                htmlCurriculum = extractCurriculumFromHTML($);
                if (htmlCurriculum && htmlCurriculum.total_sections > 0) {
                    curriculum = mergeLecturesIntoCurriculum(curriculum, htmlCurriculum);
                    const sectionsWithLectures = curriculum.sections.filter(s => s.lectures && s.lectures.length > 0).length;
                    const totalLectures = curriculum.sections.reduce((sum, s) => sum + (s.lectures?.length || 0), 0);
                    if (!silent) {
                        console.log(`  ✅ Đã merge từ HTML DOM: ${sectionsWithLectures}/${curriculum.total_sections} sections có lectures (tổng ${totalLectures} lectures)`);
                    }
                } else if (!silent) {
                    console.log('  ⚠️  Không tìm thấy lectures từ HTML DOM');
                }
            }
        }
        
        // Nếu vẫn không tìm thấy
        if (!curriculum || curriculum.total_sections === 0) {
            console.log('  ❌ Không tìm thấy curriculum');
            console.log('  📝 Đang lưu HTML để debug...');
            await fs.writeFile('debug_page_scan.html', response.body, 'utf-8');
            console.log('  ✅ Đã lưu debug_page_scan.html');
            return null;
        }
        
        // Lấy thông tin course cơ bản
        const courseInfo = {
            course_id: null,
            title: null,
            url: url
        };
        
        if (nextData) {
            // Tìm course info trong nextData
            const coursePaths = [
                ['props', 'pageProps', 'course'],
                ['props', 'pageProps', 'initialState', 'course'],
                ['course']
            ];
            
            for (const path of coursePaths) {
                let found = nextData;
                for (const key of path) {
                    if (found && typeof found === 'object' && key in found) {
                        found = found[key];
                    } else {
                        found = null;
                        break;
                    }
                }
                
                if (found && found.id) {
                    courseInfo.course_id = found.id;
                    courseInfo.title = found.title || found.displayName || null;
                    break;
                }
            }
        }
        
        // Nếu không tìm thấy trong nextData, thử lấy từ HTML
        if (!courseInfo.title) {
            // Lấy title từ meta tag hoặc h1
            const metaTitle = $('meta[property="og:title"]').attr('content') || 
                             $('meta[name="twitter:title"]').attr('content') ||
                             $('title').text();
            if (metaTitle) {
                courseInfo.title = metaTitle.trim();
            }
            
            // Lấy course ID từ URL hoặc meta
            const urlMatch = url.match(/\/course\/([^\/]+)/);
            if (urlMatch) {
                courseInfo.course_id = urlMatch[1];
            }
        }
        
        return {
            ...courseInfo,
            curriculum: curriculum
        };
        
    } catch (error) {
        console.error(`  ❌ Lỗi khi fetch: ${error.message}`);
        return null;
    }
}

/**
 * Main function
 */
async function main() {
    const inputFile = 'example_urls.txt';
    const outputFile = 'curriculum_scanned.json';
    
    console.log(`📖 Đang đọc file: ${inputFile}`);
    
    try {
        const content = await fs.readFile(inputFile, 'utf-8');
        const lines = content.split('\n');
        
        // Lấy URLs từ dòng 4-5 (index 3-4)
        const urls = [];
        for (let i = 3; i <= 4; i++) {
            if (i < lines.length) {
                const line = lines[i].trim();
                // Bỏ qua comment và dòng trống
                if (line && !line.startsWith('#')) {
                    urls.push(line);
                }
            }
        }
        
        if (urls.length === 0) {
            console.log('❌ Không tìm thấy URL nào trong dòng 4-5');
            return;
        }
        
        console.log(`✅ Tìm thấy ${urls.length} URL(s):`);
        urls.forEach((url, i) => console.log(`  ${i + 1}. ${url}`));
        
        const results = [];
        
        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            console.log(`\n[${i + 1}/${urls.length}] Xử lý URL...`);
            
            const courseData = await getCurriculumFromUrl(url);
            
            if (courseData) {
                if (courseData.curriculum.total_sections > 0) {
                    console.log(`  ✅ Tìm thấy ${courseData.curriculum.total_sections} chương, ${courseData.curriculum.total_lectures} bài học`);
                    if (courseData.title) {
                        console.log(`  📚 Khóa học: ${courseData.title}`);
                    }
                } else {
                    console.log(`  ⚠️  Không tìm thấy curriculum trong khóa học này`);
                }
                results.push(courseData);
            } else {
                console.log(`  ❌ Không thể lấy dữ liệu từ URL này`);
            }
        }
        
        // Lưu kết quả
        await fs.writeFile(
            outputFile,
            JSON.stringify(results, null, 2),
            'utf-8'
        );
        
        console.log(`\n✅ Đã lưu kết quả vào: ${outputFile}`);
        
        // Tổng kết
        console.log('\n📊 Tổng kết:');
        let totalSections = 0;
        let totalLectures = 0;
        
        results.forEach((r, i) => {
            const c = r.curriculum;
            totalSections += c.total_sections;
            totalLectures += c.total_lectures;
            const title = r.title || r.url || `Course ${i + 1}`;
            console.log(`  ${i + 1}. ${title}: ${c.total_sections} chương, ${c.total_lectures} bài học`);
        });
        
        console.log(`\n  Tổng: ${totalSections} chương, ${totalLectures} bài học`);
        
    } catch (error) {
        console.error('❌ Lỗi:', error);
        process.exit(1);
    }
}

// Run
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { getCurriculumFromUrl, extractCurriculumFromNextData, extractCurriculumFromJsonLd };
