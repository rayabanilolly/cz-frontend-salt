'format cjs';

var wrap = require('word-wrap');
var map = require('lodash.map');
var longest = require('longest');
var rightPad = require('right-pad');
var chalk = require('chalk');
const { execSync } = require('child_process');
const boxen = require('boxen');

var defaults = require('./defaults');
const LimitedInputPrompt = require('./LimitedInputPrompt');
var filter = function (array) {
    return array.filter(function (x) {
        return x;
    });
};

var filterSubject = function (subject) {
    subject = subject.trim();
    while (subject.endsWith('.')) {
        subject = subject.slice(0, subject.length - 1);
    }
    return subject;
};

// This can be any kind of SystemJS compatible module.
// We use Commonjs here, but ES6 or AMD would do just
// fine.
module.exports = function (options) {
    var getFromOptionsOrDefaults = function (key) {
        return options[key] || defaults[key];
    };

    // generate dynamic regex
    var dynamicRegex = function () {
        const jiraPrefix = getFromOptionsOrDefaults('jiraPrefix');
        const escapedPrefix = jiraPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regexPattern = new RegExp(`^(${escapedPrefix})-\\d{1,6}$`);

        return regexPattern;
    }

    var getJiraIssueLocation = function (
        type = '',
        jiraWithDecorators,
        pic = '',
        subject
    ) {
        let headerPrefix = type;
        if (headerPrefix !== '') {
            headerPrefix += ': ';
        }

        return headerPrefix + jiraWithDecorators + pic + ' ' + subject;
    };

    // Generate Jira issue prepend and append decorators
    const decorateJiraIssue = function (jiraIssue) {
        const prepend = getFromOptionsOrDefaults('jiraPrepend') || ''
        const append = getFromOptionsOrDefaults('jiraAppend') || ''
        return jiraIssue ? `${prepend}${jiraIssue}${append} ` : '';
    }

    // Generate PIC namw prepend and append decorators
    const decoratePICName = function (PIC) {
        const prepend = getFromOptionsOrDefaults('picPrepend') || ''
        const append = getFromOptionsOrDefaults('picAppend') || ''
        return PIC ? `${prepend}${PIC}${append} ` : '';
    }

    var types = getFromOptionsOrDefaults('types');

    var length = longest(Object.keys(types)).length + 1;
    var choices = map(types, function (type, key) {
        return {
            name: rightPad(key + ':', length) + ' ' + type.description,
            value: key
        };
    });

    const minHeaderWidth = getFromOptionsOrDefaults('minHeaderWidth');
    const maxHeaderWidth = getFromOptionsOrDefaults('maxHeaderWidth');

    const branchName = execSync('git branch --show-current').toString().trim();
    const username = execSync('git config user.name').toString().trim().toUpperCase();

    const jiraIssueRegex = /(?<jiraIssue>(?<!([a-zA-Z0-9]{1,10})-?)[a-zA-Z0-9]+-\d+)/;
    const matchResult = branchName.match(jiraIssueRegex);
    const jiraIssue =
        matchResult && matchResult.groups && matchResult.groups.jiraIssue;

    return {
        // When a user runs `git cz`, prompter will
        // be executed. We pass you cz, which currently
        // is just an instance of inquirer.js. Using
        // this you can ask questions and get answers.
        //
        // The commit callback should be executed when
        // you're ready to send back a commit template
        // to git.
        //
        // By default, we'll de-indent your commit
        // template and will keep empty lines.
        prompter: function (cz, commit, testMode) {
            cz.registerPrompt('limitedInput', LimitedInputPrompt);

            // Let's ask some questions of the user
            // so that we can populate our commit
            // template.
            //
            // See inquirer.js docs for specifics.
            // You can also opt to use another input
            // collection library if you prefer.
            cz.prompt([
                {
                    type: 'list',
                    name: 'type',
                    message: "Select the type of change that you're committing:",
                    choices: choices
                },
                {
                    type: 'input',
                    name: 'jira',
                    message:
                        'Enter JIRA issue (' +
                        getFromOptionsOrDefaults('jiraPrefix') +
                        '-12345)' +
                        (getFromOptionsOrDefaults('jiraOptional') ? ' (optional)' : '') +
                        ':',
                    default: jiraIssue || '',
                    validate: function (jira) {
                        if (!dynamicRegex().test(jira)) {
                            jira = '';
                            return `Invalid entered JIRA issue`;
                        }

                        return true;
                    },
                    filter: function (jira) {
                        return jira.toUpperCase();
                    }
                },
                {
                    type: 'input',
                    name: 'pic',
                    message: 'Enter PIC name of this changes: ',
                    default: username || '',
                    validate(input) {
                        if (!input) {
                            return 'PIC name can not be empty';
                        }
                        return true;
                    },
                },
                {
                    type: 'limitedInput',
                    name: 'subject',
                    message: 'Write a short, imperative tense description of the change:',
                    maxLength: maxHeaderWidth - (options.exclamationMark ? 1 : 0),
                    leadingLabel: answers => {
                        const jiraWithDecorators = decorateJiraIssue(answers.jira);
                        const PICWithDecorators = decoratePICName(answers.pic);

                        return getJiraIssueLocation(answers.type, jiraWithDecorators, PICWithDecorators, '').trim();
                    },
                    validate: input =>
                        input.length >= minHeaderWidth ||
                        `The subject must have at least ${minHeaderWidth} characters`,
                    filter: function (subject) {
                        return filterSubject(subject);
                    }
                },
                {
                    type: 'input',
                    name: 'body',
                    when: !getFromOptionsOrDefaults('skipDescription'),
                    message:
                        'Provide a longer description of the change: (press enter to skip)\n',
                    default: getFromOptionsOrDefaults('defaultBody')
                },
                {
                    type: 'confirm',
                    name: 'isBreaking',
                    when: !getFromOptionsOrDefaults('skipBreaking'),
                    message: 'Are there any breaking changes?',
                    default: false
                },
                {
                    type: 'confirm',
                    name: 'isBreaking',
                    message: 'You do know that this will bump the major version, are you sure?',
                    default: false,
                    when: function (answers) {
                        return answers.isBreaking;
                    }
                },
                {
                    type: 'input',
                    name: 'breaking',
                    message: 'Describe the breaking changes:\n',
                    when: function (answers) {
                        return answers.isBreaking;
                    }
                },
                {
                    type: 'confirm',
                    name: 'isIssueAffected',
                    message: 'Does this change affect any open issues?',
                    default: getFromOptionsOrDefaults('defaultIssues') ? true : false,
                    when: !getFromOptionsOrDefaults('jiraMode')
                },
                {
                    type: 'input',
                    name: 'issuesBody',
                    default: '-',
                    message:
                        'If issues are closed, the commit requires a body. Please enter a longer description of the commit itself:\n',
                    when: function (answers) {
                        return (
                            answers.isIssueAffected && !answers.body && !answers.breakingBody
                        );
                    }
                },
                {
                    type: 'input',
                    name: 'issues',
                    message: 'Add issue references (e.g. "fix #123", "re #123".):\n',
                    when: function (answers) {
                        return answers.isIssueAffected;
                    },
                    default: getFromOptionsOrDefaults('defaultIssues') ? getFromOptionsOrDefaults('defaultIssues') : undefined
                }
            ]).then(async function (answers) {
                var wrapOptions = {
                    trim: true,
                    cut: false,
                    newline: '\n',
                    indent: '',
                    width: getFromOptionsOrDefaults('maxLineWidth')
                };

                // Get Jira issue prepend and append decorators
                const jiraWithDecorators = decorateJiraIssue(answers.jira);
                const PICWithDecorators = decoratePICName(answers.pic);

                // Hard limit this line in the validate
                const head = getJiraIssueLocation(answers.type, jiraWithDecorators, PICWithDecorators, answers.subject);

                // // Wrap these lines at options.maxLineWidth characters
                var body = answers.body ? wrap(answers.body, wrapOptions) : false;
                if (options.jiraMode) {
                    if (body === false) {
                        body = '';
                    } else {
                        body += "\n\n";
                    }
                    body += jiraWithDecorators.trim();
                }

                // Apply breaking change prefix, removing it if already present
                var breaking = answers.breaking ? answers.breaking.trim() : '';
                breaking = breaking
                    ? 'BREAKING CHANGE: ' + breaking.replace(/^BREAKING CHANGE: /, '')
                    : '';
                breaking = breaking ? wrap(breaking, wrapOptions) : false;

                var issues = answers.issues ? wrap(answers.issues, wrapOptions) : false;

                const fullCommit = filter([head, body, breaking, issues]).join('\n\n');

                if (testMode) {
                    return commit(fullCommit);
                }

                console.log();
                console.log(chalk.underline('Commit preview:'));
                console.log(boxen(chalk.green(fullCommit), { padding: 1, margin: 1 }));

                const { doCommit } = await cz.prompt([
                    {
                        type: 'confirm',
                        name: 'doCommit',
                        message: 'Are you sure that you want to commit?'
                    }
                ]);

                if (doCommit) {
                    commit(fullCommit);
                }
            });
        }
    };
};
