document.addEventListener("DOMContentLoaded", () => {
    const careerYearNodes = document.querySelectorAll("[data-career-years]");

    if (!careerYearNodes.length) {
        return;
    }

    const careerRanges = [
        { start: { year: 2020, month: 4 }, end: { year: 2022, month: 3 } },
        { start: { year: 2022, month: 9 }, end: { year: 2024, month: 3 } },
        { start: { year: 2024, month: 6 }, end: { year: 2024, month: 9 } },
        { start: { year: 2024, month: 12 }, end: null },
    ];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const totalMonths = careerRanges.reduce((sum, range) => {
        const startMonthIndex = range.start.year * 12 + (range.start.month - 1);
        const endYear = range.end ? range.end.year : currentYear;
        const endMonth = range.end ? range.end.month : currentMonth;
        const endMonthIndex = endYear * 12 + (endMonth - 1);

        return sum + (endMonthIndex - startMonthIndex + 1);
    }, 0);

    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;
    const careerYearLabel = months === 0 ? `총 경력 ${years}년` : `총 경력 ${years}년 ${months}개월`;

    careerYearNodes.forEach((node) => {
        node.textContent = careerYearLabel;
    });
});
