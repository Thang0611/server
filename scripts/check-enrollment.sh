#!/bin/bash

# Script to check if a course is enrolled in samsungu account
# Usage: ./check-enrollment.sh <course-url>

if [ -z "$1" ]; then
    echo "Usage: $0 <course-url>"
    echo "Example: $0 https://udemy.com/course/python-basics/"
    exit 1
fi

COURSE_URL="$1"
echo "=========================================="
echo "Checking enrollment for:"
echo "$COURSE_URL"
echo "=========================================="
echo ""

cd /root/server/udemy_dl

# Run main.py with --info flag
OUTPUT=$(python3 main.py -c "$COURSE_URL" --info 2>&1)

# Check for enrollment error
if echo "$OUTPUT" | grep -qi "Failed to find the course, are you enrolled"; then
    echo "❌ NOT ENROLLED"
    echo ""
    echo "Error: Account 'samsungu' is NOT enrolled in this course."
    echo ""
    echo "Action required:"
    echo "1. Login to Udemy with samsungu account"
    echo "2. Enroll in this course"
    echo "3. Retry the failed task"
    exit 1
elif echo "$OUTPUT" | grep -qi "Course information retrieved"; then
    echo "✅ ENROLLED"
    echo ""
    echo "Success: Account 'samsungu' IS enrolled in this course."
    echo "This course can be downloaded successfully."
    exit 0
else
    echo "⚠️  UNKNOWN STATUS"
    echo ""
    echo "Output:"
    echo "$OUTPUT"
    exit 2
fi
