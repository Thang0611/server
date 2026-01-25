/**
 * Course Info Crawler
 * Crawls course information from Udemy
 * @module crawler/getCourseInfo
 */

const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');
const { getCurriculumFromUrl } = require('./scanCurriculum');
const { validateCourseUrl } = require('./urlValidator');

/**
 * Trích xuất thông tin khóa học từ HTML và JSON-LD
 */
function extractCourseInfo($, html) {
    const info = {
        title: null,
        instructorName: null,
        instructorUrl: null,
        instructorAvatar: null,
        instructorBio: null,
        ratingScore: null,
        ratingCount: null,
        students: null,
        descriptionShort: null,
        descriptionFull: null,
        language: null,
        subtitles: [],
        level: null,
        lastUpdated: null,
        originalPrice: null,
        currentPrice: null,
        currency: 'USD',
        isFree: false,
        videoHours: null,
        lectures: null,
        thumbnail: null,
        image: null,
        whatYouWillLearn: [],
        requirements: [],
        targetAudience: [],
        resources: null,
        category: null,
        topic: null,
        tags: []
    };

    // Extract từ meta tags
    info.title = $('meta[property="og:title"]').attr('content') ||
                  $('meta[name="twitter:title"]').attr('content') ||
                  $('h1[data-purpose="lead-title"]').text().trim() ||
                  $('h1').first().text().trim();

    // Extract description
    info.descriptionShort = $('meta[property="og:description"]').attr('content') ||
                            $('meta[name="description"]').attr('content') ||
                            $('[data-purpose="lead-headline"]').text().trim() ||
                            '';

    // Extract instructor
    const instructorLink = $('a[data-purpose="instructor-name-top"]').first();
    info.instructorName = instructorLink.text().trim() || 
                         $('[data-purpose="instructor-name-top"]').text().trim();
    info.instructorUrl = instructorLink.attr('href') || null;
    if (info.instructorUrl && !info.instructorUrl.startsWith('http')) {
        info.instructorUrl = 'https://www.udemy.com' + info.instructorUrl;
    }
    
    // Extract instructor avatar
    const instructorAvatar = $('[data-purpose="instructor-image"] img').first() ||
                            $('img[data-purpose="instructor-image"]').first() ||
                            $('.instructor-image img').first();
    if (instructorAvatar.length > 0) {
        info.instructorAvatar = instructorAvatar.attr('src') || instructorAvatar.attr('data-src') || null;
    }
    
    // Extract instructor bio
    const instructorBio = $('[data-purpose="instructor-bio"]').text().trim() ||
                          $('.instructor-bio').text().trim() ||
                          $('[data-purpose="instructor-description"]').text().trim();
    if (instructorBio) {
        info.instructorBio = instructorBio;
    }

    // Extract rating
    const ratingText = $('[data-purpose="rating-number"]').text().trim();
    if (ratingText) {
        info.ratingScore = parseFloat(ratingText);
    }
    
    const ratingCountText = $('[data-purpose="rating-count"]').text().trim() ||
                           $('[data-purpose="rating"]').text().trim();
    if (ratingCountText) {
        const match = ratingCountText.match(/([\d,]+)/);
        if (match) {
            info.ratingCount = parseInt(match[1].replace(/,/g, ''));
        }
    }

    // Extract students count
    const studentsText = $('[data-purpose="enrollment"]').text().trim();
    if (studentsText) {
        const match = studentsText.match(/([\d,]+)/);
        if (match) {
            info.students = parseInt(match[1].replace(/,/g, ''));
        }
    }

    // Extract content info
    const contentInfo = $('[data-purpose="course-content-info"]').text().trim();
    if (contentInfo) {
        const hoursMatch = contentInfo.match(/([\d.]+)\s*(?:hours?|hrs?|giờ)/i);
        if (hoursMatch) {
            info.videoHours = parseFloat(hoursMatch[1]);
        }
        
        const lecturesMatch = contentInfo.match(/(\d+)\s*lectures?/i);
        if (lecturesMatch) {
            info.lectures = parseInt(lecturesMatch[1]);
        }
    }

    // Bỏ qua phần lấy giá

    // Extract thumbnail/image
    info.thumbnail = $('meta[property="og:image"]').attr('content') ||
                     $('meta[name="twitter:image"]').attr('content') ||
                     $('[data-purpose="course-image"] img').attr('src') ||
                     $('[data-purpose="course-image"] img').attr('data-src') ||
                     $('.course-image img').first().attr('src') ||
                     null;
    
    info.image = info.thumbnail; // Alias
    
    // Extract "What you will learn"
    const whatYouWillLearnItems = $('[data-purpose="what-you-will-learn"] li, .what-you-will-learn li, [data-purpose="learning-objectives"] li');
    whatYouWillLearnItems.each((i, elem) => {
        const text = $(elem).text().trim();
        if (text) {
            info.whatYouWillLearn.push(text);
        }
    });
    
    // Extract requirements
    const requirementsItems = $('[data-purpose="requirements"] li, .requirements li, [data-purpose="course-requirements"] li');
    requirementsItems.each((i, elem) => {
        const text = $(elem).text().trim();
        if (text) {
            info.requirements.push(text);
        }
    });
    
    // Extract target audience
    const targetAudienceItems = $('[data-purpose="target-audience"] li, .target-audience li, [data-purpose="who-this-course-is-for"] li');
    targetAudienceItems.each((i, elem) => {
        const text = $(elem).text().trim();
        if (text) {
            info.targetAudience.push(text);
        }
    });
    
    // Extract resources count
    const resourcesText = $('[data-purpose="course-content-info"]').text().trim();
    if (resourcesText) {
        const resourcesMatch = resourcesText.match(/(\d+)\s*(?:resources?|tài liệu)/i);
        if (resourcesMatch) {
            info.resources = parseInt(resourcesMatch[1]);
        }
    }
    
    // Extract category/topic từ links
    $('a[href*="/topic/"]').each((i, elem) => {
        const href = $(elem).attr('href');
        const text = $(elem).text().trim();
        if (text && href) {
            const topicSlug = href.match(/\/topic\/([^\/\?]+)/)?.[1];
            if (topicSlug) {
                // Lấy category chính (thường là link cuối cùng hoặc link có text dài nhất)
                if (!info.category || text.length > info.category.length) {
                    info.category = text;
                    info.topic = topicSlug;
                }
                // Thêm vào tags
                if (!info.tags.includes(text)) {
                    info.tags.push(text);
                }
            }
        }
    });
    
    // Extract từ breadcrumb
    const breadcrumbSelectors = [
        '[data-purpose="breadcrumb"]',
        '[class*="breadcrumb"]',
        'nav[aria-label*="breadcrumb"]',
        '.breadcrumb'
    ];
    
    for (const selector of breadcrumbSelectors) {
        const breadcrumb = $(selector).first();
        if (breadcrumb.length > 0) {
            // Lấy text từ các link trong breadcrumb
            const breadcrumbLinks = breadcrumb.find('a');
            if (breadcrumbLinks.length > 0) {
                const parts = [];
                breadcrumbLinks.each((i, elem) => {
                    const text = $(elem).text().trim();
                    if (text) {
                        // Decode HTML entities
                        const decoded = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                        parts.push(decoded);
                    }
                });
                
                if (parts.length > 0) {
                    // Lưu full path
                    info.categoryPath = parts.join(' > ');
                    
                    // Lấy phần cuối cùng (thường là topic chính) nếu chưa có category
                    if (!info.category && parts.length > 0) {
                        info.category = parts[parts.length - 1];
                    }
                    
                    // Lấy tất cả các phần làm tags
                    parts.forEach(part => {
                        if (!info.tags.includes(part)) {
                            info.tags.push(part);
                        }
                    });
                    
                    break; // Đã tìm thấy, không cần tìm tiếp
                }
            } else {
                // Nếu không có links, thử parse từ text
                const breadcrumbText = breadcrumb.text().trim();
                if (breadcrumbText) {
                    // Thử split bằng ">" hoặc các ký tự phân cách khác
                    let parts = breadcrumbText.split(/>|»/).map(p => p.trim()).filter(Boolean);
                    
                    // Nếu không có dấu phân cách, thử tách bằng các từ khóa phổ biến
                    if (parts.length === 1 && breadcrumbText.length > 20) {
                        // Có thể là "Teaching & AcademicsLanguage LearningJapanese Language"
                        // Thử tách bằng các pattern phổ biến
                        const commonPatterns = [
                            /(Teaching\s*&\s*Academics)(Language\s*Learning)(.+)/i,
                            /(.+?)(Language\s*Learning)(.+)/i
                        ];
                        
                        for (const pattern of commonPatterns) {
                            const match = breadcrumbText.match(pattern);
                            if (match) {
                                parts = match.slice(1).map(p => p.trim()).filter(Boolean);
                                break;
                            }
                        }
                    }
                    
                    if (parts.length > 0) {
                        info.categoryPath = parts.join(' > ');
                        if (!info.category && parts.length > 0) {
                            info.category = parts[parts.length - 1];
                        }
                        parts.forEach(part => {
                            if (!info.tags.includes(part)) {
                                info.tags.push(part);
                            }
                        });
                        break;
                    }
                }
            }
        }
    }
    
    // Extract từ data-purpose="topic-link" nếu chưa có
    if (!info.category) {
        const topicLink = $('a[data-purpose="topic-link"], .topic-link, [data-purpose="topic"]').first();
        if (topicLink.length > 0) {
            info.category = topicLink.text().trim();
            const href = topicLink.attr('href');
            if (href) {
                info.topic = href.match(/\/topic\/([^\/\?]+)/)?.[1] || null;
            }
        }
    }
    
    // Extract metadata
    const metadataItems = $('[data-purpose="course-metadata"]').find('span');
    metadataItems.each((i, elem) => {
        const text = $(elem).text().trim();
        if (text.includes('Language:')) {
            info.language = text.replace('Language:', '').trim();
        } else if (text.includes('Level:')) {
            info.level = text.replace('Level:', '').trim();
        } else if (text.includes('Updated')) {
            info.lastUpdated = text.replace(/Updated\s*/i, '').trim();
        }
    });

    // Extract từ JSON-LD
    const jsonLdScripts = $('script[type="application/ld+json"]');
    jsonLdScripts.each((i, elem) => {
        try {
            const scriptContent = $(elem).html();
            if (!scriptContent) return;
            
            let jsonLdData = null;
            if (scriptContent.trim().startsWith('[')) {
                jsonLdData = JSON.parse(scriptContent);
                if (Array.isArray(jsonLdData)) {
                    jsonLdData = jsonLdData.find(item => {
                        const type = item['@type'];
                        return type === 'Course' || 
                               type === 'http://schema.org/Course' ||
                               type === 'https://schema.org/Course' ||
                               (Array.isArray(type) && type.some(t => t.includes('Course')));
                    });
                }
            } else {
                jsonLdData = JSON.parse(scriptContent);
                
                if (jsonLdData['@graph'] && Array.isArray(jsonLdData['@graph'])) {
                    jsonLdData = jsonLdData['@graph'].find(item => {
                        const type = item['@type'];
                        return type === 'Course' || 
                               type === 'http://schema.org/Course' ||
                               type === 'https://schema.org/Course' ||
                               (Array.isArray(type) && type.some(t => t.includes('Course')));
                    });
                } else {
                    const itemType = jsonLdData['@type'];
                    const isCourse = itemType === 'Course' || 
                                   itemType === 'http://schema.org/Course' ||
                                   itemType === 'https://schema.org/Course' ||
                                   (Array.isArray(itemType) && itemType.some(t => 
                                       t === 'Course' || t === 'http://schema.org/Course' || t === 'https://schema.org/Course'
                                   ));
                    
                    if (!isCourse) {
                        jsonLdData = null;
                    }
                }
            }
            
            if (jsonLdData) {
                // Update info từ JSON-LD
                if (jsonLdData.name && !info.title) {
                    info.title = jsonLdData.name;
                }
                
                if (jsonLdData.description && !info.descriptionFull) {
                    info.descriptionFull = jsonLdData.description;
                }
                
                // Extract image/thumbnail
                if (jsonLdData.image && !info.thumbnail) {
                    if (typeof jsonLdData.image === 'string') {
                        info.thumbnail = jsonLdData.image;
                        info.image = jsonLdData.image;
                    } else if (jsonLdData.image.url) {
                        info.thumbnail = jsonLdData.image.url;
                        info.image = jsonLdData.image.url;
                    }
                }
                
                // Extract what you will learn
                if (jsonLdData.teaches && !info.whatYouWillLearn.length) {
                    if (Array.isArray(jsonLdData.teaches)) {
                        info.whatYouWillLearn = jsonLdData.teaches;
                    } else if (typeof jsonLdData.teaches === 'string') {
                        info.whatYouWillLearn = [jsonLdData.teaches];
                    }
                }
                
                // Extract requirements
                if (jsonLdData.requirements && !info.requirements.length) {
                    if (Array.isArray(jsonLdData.requirements)) {
                        info.requirements = jsonLdData.requirements;
                    } else if (typeof jsonLdData.requirements === 'string') {
                        info.requirements = [jsonLdData.requirements];
                    }
                }
                
                // Extract category/topic từ JSON-LD
                if (jsonLdData.about) {
                    let categoryText = null;
                    if (Array.isArray(jsonLdData.about)) {
                        // Lấy name từ các item trong about
                        const names = jsonLdData.about.map(item => {
                            if (typeof item === 'string') return item;
                            if (item.name) {
                                // Nếu là array, lấy phần tử đầu tiên
                                return Array.isArray(item.name) ? item.name[0] : item.name;
                            }
                            return null;
                        }).filter(Boolean);
                        if (names.length > 0) {
                            categoryText = names.join(' > ');
                        }
                    } else if (typeof jsonLdData.about === 'string') {
                        categoryText = jsonLdData.about;
                    } else if (jsonLdData.about.name) {
                        categoryText = Array.isArray(jsonLdData.about.name) 
                            ? jsonLdData.about.name[0] 
                            : jsonLdData.about.name;
                    }
                    
                    if (categoryText && !info.category) {
                        // Decode HTML entities
                        categoryText = categoryText.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                        info.category = categoryText;
                    }
                }
                
                // Extract keywords làm tags
                if (jsonLdData.keywords) {
                    const keywords = Array.isArray(jsonLdData.keywords) 
                        ? jsonLdData.keywords 
                        : (typeof jsonLdData.keywords === 'string' ? jsonLdData.keywords.split(',') : []);
                    keywords.forEach(keyword => {
                        const kw = keyword.trim();
                        if (kw && !info.tags.includes(kw)) {
                            info.tags.push(kw);
                        }
                    });
                }
                
                if (jsonLdData.aggregateRating) {
                    if (jsonLdData.aggregateRating.ratingValue && !info.ratingScore) {
                        info.ratingScore = parseFloat(jsonLdData.aggregateRating.ratingValue);
                    }
                    if (jsonLdData.aggregateRating.reviewCount && !info.ratingCount) {
                        info.ratingCount = parseInt(jsonLdData.aggregateRating.reviewCount);
                    }
                }
                
                if (jsonLdData.provider) {
                    if (jsonLdData.provider.name && !info.instructorName) {
                        info.instructorName = jsonLdData.provider.name;
                    }
                    if (jsonLdData.provider.url && !info.instructorUrl) {
                        info.instructorUrl = jsonLdData.provider.url;
                    }
                    if (jsonLdData.provider.image && !info.instructorAvatar) {
                        if (typeof jsonLdData.provider.image === 'string') {
                            info.instructorAvatar = jsonLdData.provider.image;
                        } else if (jsonLdData.provider.image.url) {
                            info.instructorAvatar = jsonLdData.provider.image.url;
                        }
                    }
                }
                
                if (jsonLdData.inLanguage && !info.language) {
                    info.language = jsonLdData.inLanguage;
                }
                
                if (jsonLdData.educationalLevel && !info.level) {
                    info.level = jsonLdData.educationalLevel;
                }
                
                // Bỏ qua phần lấy giá từ JSON-LD
                
                return false; // break loop
            }
        } catch (e) {
            // Ignore parse errors
        }
    });

    return info;
}

/**
 * Chuẩn hóa output - loại bỏ các trường không cần thiết
 */
function normalizeOutput(data) {
    const normalized = {
        course_id: data.course_id || null,
        url: data.url || null,
        title: data.title || null,
        ...(data.thumbnail ? { thumbnail: data.thumbnail } : {}),
        ...(data.image && data.image !== data.thumbnail ? { image: data.image } : {}),
        instructor: data.instructor?.name ? {
            name: data.instructor.name,
            ...(data.instructor.url ? { url: data.instructor.url } : {}),
            ...(data.instructor.avatar ? { avatar: data.instructor.avatar } : {}),
            ...(data.instructor.bio ? { bio: data.instructor.bio } : {})
        } : null,
        rating: (data.rating?.score || data.rating?.count) ? {
            ...(data.rating.score ? { score: data.rating.score } : {}),
            ...(data.rating.count ? { count: data.rating.count } : {})
        } : null,
        ...(data.students ? { students: data.students } : {}),
        content: {
            ...(data.content?.lectures ? { lectures: data.content.lectures } : {}),
            ...(data.content?.sections ? { sections: data.content.sections } : {}),
            ...(data.content?.video_hours ? { video_hours: data.content.video_hours } : {}),
            ...(data.content?.total_duration_seconds ? { total_duration_seconds: data.content.total_duration_seconds } : {}),
            ...(data.content?.resources ? { resources: data.content.resources } : {})
        },
        description: {
            ...(data.description?.short ? { short: data.description.short } : {}),
            ...(data.description?.full ? { full: data.description.full } : {}),
            ...(data.description?.what_you_will_learn ? { what_you_will_learn: data.description.what_you_will_learn } : {}),
            ...(data.description?.requirements ? { requirements: data.description.requirements } : {}),
            ...(data.description?.target_audience ? { target_audience: data.description.target_audience } : {})
        },
        ...(Object.keys(data.metadata || {}).length > 0 ? {
            metadata: {
                ...(data.metadata?.language ? { language: data.metadata.language } : {}),
                ...(data.metadata?.subtitles?.length ? { subtitles: data.metadata.subtitles } : {}),
                ...(data.metadata?.level ? { level: data.metadata.level } : {}),
                ...(data.metadata?.last_updated ? { last_updated: data.metadata.last_updated } : {}),
                ...(data.metadata?.category ? { category: data.metadata.category } : {}),
                ...(data.metadata?.topic ? { topic: data.metadata.topic } : {}),
                ...(data.metadata?.category_path ? { category_path: data.metadata.category_path } : {}),
                ...(data.metadata?.tags ? { tags: data.metadata.tags } : {})
            }
        } : {}),
        // Bỏ qua pricing
        curriculum: {
            total_sections: data.curriculum?.total_sections || 0,
            total_lectures: data.curriculum?.total_lectures || 0,
            ...(data.curriculum?.total_duration_seconds ? { total_duration_seconds: data.curriculum.total_duration_seconds } : {}),
            sections: (data.curriculum?.sections || []).map(section => {
                const normalizedSection = {
                    id: section.section_id || String(section.section_index - 1),
                    index: section.section_index,
                    title: section.title || '',
                    ...(section.description ? { description: section.description } : {}),
                    lecture_count: section.lecture_count || 0,
                    ...(section.content_length_seconds ? { duration_seconds: section.content_length_seconds } : {}),
                    lectures: (section.lectures || []).map(lecture => {
                        const normalizedLecture = {
                            id: lecture.lecture_id || null,
                            index: lecture.lecture_index,
                            title: lecture.title || '',
                            type: lecture.type || 'LECTURE',
                            ...(lecture.duration_seconds ? { duration_seconds: lecture.duration_seconds } : {}),
                            ...(lecture.is_previewable ? { is_previewable: lecture.is_previewable } : {}),
                            ...(lecture.thumbnail && lecture.thumbnail !== '$undefined' && lecture.thumbnail !== 'undefined' ? { thumbnail: lecture.thumbnail } : {}),
                            ...(lecture.url_landing && lecture.url_landing !== '' ? { url_landing: lecture.url_landing } : {}),
                            ...(lecture.url_enroll && lecture.url_enroll !== '' ? { url_enroll: lecture.url_enroll } : {})
                        };
                        
                        // Loại bỏ các trường null/undefined
                        Object.keys(normalizedLecture).forEach(key => {
                            if (normalizedLecture[key] === null || normalizedLecture[key] === undefined) {
                                delete normalizedLecture[key];
                            }
                        });
                        
                        return normalizedLecture;
                    })
                };
                
                // Loại bỏ các trường rỗng
                if (!normalizedSection.description) {
                    delete normalizedSection.description;
                }
                
                return normalizedSection;
            })
        }
    };
    
    // Loại bỏ các trường null/undefined ở top level
    Object.keys(normalized).forEach(key => {
        if (normalized[key] === null || normalized[key] === undefined) {
            delete normalized[key];
        }
    });
    
    // Loại bỏ các object rỗng
    if (normalized.description && Object.keys(normalized.description).length === 0) {
        delete normalized.description;
    }
    
    if (normalized.metadata && Object.keys(normalized.metadata).length === 0) {
        delete normalized.metadata;
    }
    
    if (normalized.content && Object.keys(normalized.content).length === 0) {
        delete normalized.content;
    }
    
    return normalized;
}

/**
 * Extract thông tin từ __NEXT_DATA__
 */
function extractFromNextData($, html) {
    const info = {
        instructorAvatar: null,
        instructorBio: null,
        category: null,
        topic: null,
        tags: [],
        resources: null
    };
    
    try {
        // Tìm __NEXT_DATA__ script tag
        const nextDataScript = $('script#__NEXT_DATA__').html();
        if (!nextDataScript) return info;
        
        const nextData = JSON.parse(nextDataScript);
        
        // Tìm course data trong __NEXT_DATA__
        const findCourseData = (obj, path = '') => {
            if (typeof obj !== 'object' || obj === null) return null;
            
            // Kiểm tra nếu có course object
            if (obj.course) {
                return obj.course;
            }
            
            // Kiểm tra nếu có courseId hoặc course_id
            if (obj.courseId || obj.course_id) {
                return obj;
            }
            
            // Recursively search
            for (const key in obj) {
                if (key === 'course' || key.includes('Course') || key.includes('course')) {
                    const found = findCourseData(obj[key], path + '.' + key);
                    if (found) return found;
                }
            }
            
            // Search in common paths
            if (obj.props?.pageProps?.course) {
                return obj.props.pageProps.course;
            }
            
            return null;
        };
        
        const courseData = findCourseData(nextData);
        
        if (courseData) {
            // Extract instructor info
            if (courseData.visibleInstructors && Array.isArray(courseData.visibleInstructors) && courseData.visibleInstructors.length > 0) {
                const instructor = courseData.visibleInstructors[0];
                if (instructor.image_100x100 || instructor.image_50x50) {
                    info.instructorAvatar = instructor.image_100x100 || instructor.image_50x50;
                }
                if (instructor.description) {
                    info.instructorBio = instructor.description;
                }
            }
            
            // Extract category/topic
            if (courseData.primaryCategory) {
                const catTitle = courseData.primaryCategory.title || courseData.primaryCategory.name;
                const catSlug = courseData.primaryCategory.slug || courseData.primaryCategory.id;
                if (catTitle && !info.category) {
                    info.category = catTitle;
                }
                if (catSlug && !info.topic) {
                    info.topic = String(catSlug);
                }
            }
            
            // Extract từ topicId nếu có
            if (courseData.topicId && !info.topic) {
                info.topic = String(courseData.topicId);
            }
            
            // Extract tags từ categories
            if (courseData.categories && Array.isArray(courseData.categories)) {
                courseData.categories.forEach(cat => {
                    const catTitle = cat.title || cat.name;
                    if (catTitle) {
                        if (!info.tags.includes(catTitle)) {
                            info.tags.push(catTitle);
                        }
                        // Nếu chưa có category, lấy từ categories
                        if (!info.category) {
                            info.category = catTitle;
                        }
                    }
                });
            }
            
            // Extract từ topic object nếu có
            if (courseData.topic) {
                const topicTitle = courseData.topic.title || courseData.topic.name;
                const topicSlug = courseData.topic.slug || courseData.topic.id;
                if (topicTitle && !info.category) {
                    info.category = topicTitle;
                }
                if (topicSlug && !info.topic) {
                    info.topic = String(topicSlug);
                }
            }
            
            // Extract resources
            if (courseData.numPublishedAssets !== undefined) {
                info.resources = courseData.numPublishedAssets;
            }
            
            // Bỏ qua phần lấy giá từ __NEXT_DATA__
        }
    } catch (e) {
        // Ignore parse errors
    }
    
    return info;
}

/**
 * Lấy thông tin đầy đủ khóa học từ URL
 */
/**
 * Get full course information from Udemy
 * @param {string} url - Course URL (must be validated)
 * @param {Object} options - Options
 * @param {boolean} options.silent - Suppress console logs
 * @param {string} options.cookiesPath - Path to cookies file
 * @returns {Promise<Object>} - Course data
 */
async function getFullCourseInfo(url, options = {}) {
    const { silent = false, cookiesPath = null } = options;
    
    // Validate URL
    const validation = validateCourseUrl(url);
    if (!validation.valid) {
        throw new Error(`Invalid URL: ${validation.error}`);
    }
    const sanitizedUrl = validation.sanitized;
    
    const { gotScraping } = await import('got-scraping');
    
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
        console.log(`\n📡 Đang fetch thông tin khóa học: ${sanitizedUrl}`);
    }
    
    try {
        const response = await gotScraping({
            url: sanitizedUrl,
            method: 'GET',
            http2: true,
            headers: { 
                'Cookie': cookies, 
                'Referer': sanitizedUrl,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9,vi-VN;q=0.8,vi;q=0.7'
            },
            timeout: { request: 60000 }, // Tăng lên 60s để đảm bảo lấy đầy đủ lecture
            retry: {
                limit: 2,
                methods: ['GET'],
                statusCodes: [408, 413, 429, 500, 502, 503, 504]
            }
        });
        
        const $ = cheerio.load(response.body);
        
        // Extract course info từ HTML và JSON-LD
        const courseInfo = extractCourseInfo($, response.body);
        
        // Extract thêm từ __NEXT_DATA__
        const nextDataInfo = extractFromNextData($, response.body);
        
        // Merge thông tin từ __NEXT_DATA__
        if (nextDataInfo.instructorAvatar && !courseInfo.instructorAvatar) {
            courseInfo.instructorAvatar = nextDataInfo.instructorAvatar;
        }
        if (nextDataInfo.instructorBio && !courseInfo.instructorBio) {
            courseInfo.instructorBio = nextDataInfo.instructorBio;
        }
        if (nextDataInfo.category && !courseInfo.category) {
            courseInfo.category = nextDataInfo.category;
        }
        if (nextDataInfo.topic && !courseInfo.topic) {
            courseInfo.topic = nextDataInfo.topic;
        }
        if (nextDataInfo.tags.length > 0 && courseInfo.tags.length === 0) {
            courseInfo.tags = nextDataInfo.tags;
        }
        if (nextDataInfo.resources && !courseInfo.resources) {
            courseInfo.resources = nextDataInfo.resources;
        }
        
        // Extract curriculum
        if (!silent) {
            console.log('  📚 Đang lấy curriculum...');
        }
        const curriculumData = await getCurriculumFromUrl(sanitizedUrl, { silent });
        
        // Kết hợp dữ liệu
        const fullCourseData = {
            course_id: curriculumData?.course_id || sanitizedUrl.match(/\/course\/([^\/]+)/)?.[1] || null,
            url: sanitizedUrl,
            title: courseInfo.title || curriculumData?.title || null,
            thumbnail: courseInfo.thumbnail || courseInfo.image || null,
            image: courseInfo.image || courseInfo.thumbnail || null,
            instructor: {
                name: courseInfo.instructorName || null,
                url: courseInfo.instructorUrl || null,
                avatar: courseInfo.instructorAvatar || null,
                bio: courseInfo.instructorBio || null
            },
            rating: {
                score: courseInfo.ratingScore || null,
                count: courseInfo.ratingCount || null
            },
            students: courseInfo.students || null,
            content: {
                lectures: curriculumData?.curriculum?.total_lectures || courseInfo.lectures || null,
                sections: curriculumData?.curriculum?.total_sections || null,
                video_hours: courseInfo.videoHours || 
                            (curriculumData?.curriculum?.total_duration_seconds 
                                ? (curriculumData.curriculum.total_duration_seconds / 3600).toFixed(2) 
                                : null),
                total_duration_seconds: curriculumData?.curriculum?.total_duration_seconds || null,
                resources: courseInfo.resources || null
            },
            description: {
                short: courseInfo.descriptionShort || null,
                full: courseInfo.descriptionFull || null,
                what_you_will_learn: courseInfo.whatYouWillLearn.length > 0 ? courseInfo.whatYouWillLearn : null,
                requirements: courseInfo.requirements.length > 0 ? courseInfo.requirements : null,
                target_audience: courseInfo.targetAudience.length > 0 ? courseInfo.targetAudience : null
            },
            metadata: {
                language: courseInfo.language || null,
                subtitles: courseInfo.subtitles || [],
                level: courseInfo.level || null,
                last_updated: courseInfo.lastUpdated || null,
                category: courseInfo.category || null,
                topic: courseInfo.topic || null,
                category_path: courseInfo.categoryPath || null,
                tags: courseInfo.tags.length > 0 ? courseInfo.tags : null
            },
            // Bỏ qua pricing
            curriculum: curriculumData?.curriculum || {
                total_sections: 0,
                total_lectures: 0,
                total_duration_seconds: 0,
                sections: []
            }
        };
        
        // Chuẩn hóa output trước khi trả về
        return normalizeOutput(fullCourseData);
        
    } catch (error) {
        console.error(`  ❌ Lỗi khi fetch: ${error.message}`);
        throw error;
    }
}

/**
 * Đọc danh sách URL từ file
 */
async function readUrlsFromFile(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        const urls = content
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#') && line.includes('udemy.com/course/'));
        return urls;
    } catch (error) {
        throw new Error(`Không thể đọc file: ${error.message}`);
    }
}

/**
 * Kiểm tra xem input là file hay URL
 */
function isFile(input) {
    // Nếu không phải URL (không có http/https và không có udemy.com), coi như là file
    return !input.startsWith('http://') && !input.startsWith('https://');
}

/**
 * Main function
 */
async function main() {
    const input = process.argv[2];
    const outputFile = process.argv[3] || 'course_info.json';
    
    if (!input) {
        console.error('❌ Vui lòng cung cấp URL hoặc file chứa danh sách URL.');
        console.error('   Ví dụ:');
        console.error('     node get_course_info.js "https://www.udemy.com/course/japanese-n5-course-vn/"');
        console.error('     node get_course_info.js urls.txt');
        process.exit(1);
    }
    
    let urls = [];
    
    // Kiểm tra xem input là file hay URL
    if (isFile(input)) {
        // Đọc từ file
        console.log(`📂 Đang đọc danh sách URL từ file: ${input}`);
        urls = await readUrlsFromFile(input);
        
        if (urls.length === 0) {
            console.error('❌ Không tìm thấy URL hợp lệ trong file.');
            process.exit(1);
        }
        
        console.log(`✅ Tìm thấy ${urls.length} URL(s) trong file.\n`);
    } else {
        // Xử lý như URL đơn
        if (!input.includes('udemy.com/course/')) {
            console.error('❌ URL không hợp lệ. Vui lòng cung cấp URL khóa học Udemy.');
            console.error('   Ví dụ: node get_course_info.js "https://www.udemy.com/course/japanese-n5-course-vn/"');
            process.exit(1);
        }
        urls = [input];
    }
    
    const results = [];
    const errors = [];
    
    try {
        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            console.log(`\n[${i + 1}/${urls.length}] Đang xử lý: ${url}`);
            
            try {
                const courseData = await getFullCourseInfo(url);
                results.push(courseData);
                
                console.log(`   ✅ Thành công: ${courseData.title || 'N/A'}`);
                
                // Delay giữa các request để tránh bị rate limit
                if (i < urls.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 5000)); // Tăng lên 5 giây delay để đảm bảo lấy đầy đủ lecture
                }
            } catch (error) {
                console.error(`   ❌ Lỗi: ${error.message}`);
                errors.push({ url, error: error.message });
            }
        }
        
        // Lưu kết quả
        if (results.length > 0) {
            if (results.length === 1) {
                // Nếu chỉ có 1 kết quả, lưu như object đơn
                await fs.writeFile(
                    outputFile,
                    JSON.stringify(results[0], null, 2),
                    'utf-8'
                );
            } else {
                // Nếu có nhiều kết quả, lưu như array
                await fs.writeFile(
                    outputFile,
                    JSON.stringify(results, null, 2),
                    'utf-8'
                );
            }
        }
        
        // Tóm tắt kết quả
        console.log(`\n\n📊 TÓM TẮT:`);
        console.log(`   ✅ Thành công: ${results.length}/${urls.length}`);
        console.log(`   ❌ Lỗi: ${errors.length}/${urls.length}`);
        
        if (results.length > 0) {
            console.log(`\n💾 Đã lưu kết quả vào: ${outputFile}`);
        }
        
        if (errors.length > 0) {
            console.log(`\n⚠️  Các URL lỗi:`);
            errors.forEach(({ url, error }) => {
                console.log(`   - ${url}: ${error}`);
            });
        }
        
    } catch (error) {
        console.error('\n❌ Lỗi:', error.message);
        process.exit(1);
    }
}

// Run
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { getFullCourseInfo, extractCourseInfo, normalizeOutput };
