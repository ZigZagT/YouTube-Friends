import { youtube_v3 } from 'googleapis';
import { fetchApi } from 'lib/client/api';
import { NextPageContext } from 'next';
import styled from 'styled-components';
import React from 'react';
import { useForm, Controller } from 'react-hook-form';
import getDebug from 'debug';
import Head from 'next/head';
import { UserProfile, YouTubeMailSettings, EmailPreview } from 'lib/server/google';
const debug = getDebug('YTF:pages/index.tsx');

type Props = {
    isLoggedIn: boolean;
    authUrl: string;
    playlists: youtube_v3.Schema$Playlist[];
    profile: UserProfile;
    initialSettings: YouTubeMailSettings[];
    emailPreviews: {
        [serial: number]: EmailPreview;
    };
};

async function logout(req?, res?) {
    await fetchApi('/api/logout', { req, res });
    !req && !res && window.location.reload();
}

const PlaylistItemGrid = styled.div`
    display: grid;
    grid-template-columns: 120px auto;
    grid-template-rows: 90px;

    & > :nth-child(1) {
        grid-column: 1;

        display: grid;
        grid-template-columns: auto 1em;
        grid-template-rows: auto 1em;
        align-items: center;

        & > img {
            grid-column: 1/3;
            grid-row: 1/3;
            width: 100%;
        }

        & > span {
            grid-column: 2;
            grid-row: 2;
            font-size: 1em;
            color: white;
            background-color: rgba(0, 0, 0, 0.3);
        }
    }

    & > :nth-child(2) {
        grid-column: 2;

        padding: 10px 10px;
        display: grid;
        grid-template-rows: 1fr 3fr;

        & > h2 {
            margin: 0;
            font-size: 18px;
        }
        & > p {
            margin: 0;
            align-self: center;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
        }
    }
`;

function PlaylistItem({ item }: { item: youtube_v3.Schema$Playlist }) {
    const { title, description } = item.snippet.localized;
    const thumbnailUrl = Object.values(item.snippet.thumbnails).sort((t1, t2) =>
        t2.width * t2.height > t1.width * t1.height ? 1 : -1,
    )[0].url;
    const { itemCount } = item.contentDetails;
    return (
        <PlaylistItemGrid>
            <div>
                <img src={thumbnailUrl} />
                <span>{itemCount}</span>
            </div>
            <div>
                <h2>{title}</h2>
                <p>{description}</p>
            </div>
        </PlaylistItemGrid>
    );
}

function PlaylistSelect({
    name,
    playlistsData,
    value,
    onChange,
}: {
    name: string;
    playlistsData: youtube_v3.Schema$Playlist[];
    value: string;
    onChange: (string) => void;
}) {
    return (
        <>
            {playlistsData.map((item) => (
                <label
                    key={item.id}
                    style={{
                        display: 'grid',
                        gridTemplateColumns: '1em auto',
                        alignItems: 'center',
                        gridGap: '0.5em',
                    }}
                >
                    <input
                        type="radio"
                        name={name}
                        value={item.id}
                        checked={value === item.id}
                        onChange={() => onChange(item.id)}
                    />
                    <PlaylistItem item={item} />
                </label>
            ))}
        </>
    );
}

const PageStyle = styled.div`
    display: flex;
    min-width: 712px;
    flex-direction: column;
    label {
        display: flex;
    }
    input {
        display: flex;
    }
`;

const HeaderStyle = styled.div`
    display: flex;
    justify-content: flex-end;
    align-items: center;
    height: 30px;
    background-color: #eee;

    @media screen and (max-width: 1200px) {
        flex-wrap: wrap;
    }

    & > * {
        margin: 0;
        max-height: 30px;
        margin-left: 10px;
        margin-right: 10px;
    }
`;

const MainZone = styled.div`
    display: flex;
    width: 100%;
    justify-content: space-between;

    @media screen and (max-width: 1200px) {
        justify-content: flex-start;
        flex-direction: column;
    }
`;

const SideBarZone = styled.div`
    display: flex;
    background-color: #eee;
    padding: 0 5px;
    flex-grow: 0;
    flex-shrink: 0;
    flex-direction: column;
    align-items: center;
    width: 50px;

    @media screen and (max-width: 1200px) {
        flex-direction: row;
        flex-wrap: wrap;
        padding: 0;
        width: 100%;
        height: 30px;
    }

    & > * {
        display: flex;
        width: 100%;
        justify-content: center;
        align-items: center;
        margin-top: 5px;

        @media screen and (max-width: 1200px) {
            width: 50px;
            height: 25px;
            margin-top: 0;
            margin-left: 5px;
        }
    }
`;

const FormZone = styled.div`
    display: flex;
    padding: 0 5px;

    & label {
        margin: 5px;
    }
    & input {
        margin: 0 5px;
    }
`;

const FormActions = styled.div`
    display: flex;
    margin: 5px;

    & > * {
        margin-right: 5px;
    }
`;

const PreviewZonePlaceholder = styled.div`
    display: flex;
    flex-shrink: 0;
    box-sizing: content-box;
    border: solid 0px transparent;
    width: 712px;
`;

const PreviewZoneContent = styled.div`
    width: 700px;
    border: solid 1px black;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    border-radius: 8px;
    padding: 5px;
    overflow-x: hidden;
    overflow-y: scroll;

    @media screen and (min-width: 1200px) {
        position: fixed;
        bottom: 0;
        right: 0;
        height: calc(100vh - 30px - 10px - 2px);
    }
`;

const PreviewZone = ({ children }) => {
    return (
        <PreviewZonePlaceholder>
            <PreviewZoneContent>{children}</PreviewZoneContent>
        </PreviewZonePlaceholder>
    );
};

export default function Page({
    isLoggedIn,
    authUrl,
    playlists,
    profile,
    initialSettings,
    emailPreviews: initialEmailPreviews,
}: Props) {
    const [progressText, setProgressText] = React.useState<string>();
    const [previewData, setPreviewData] = React.useState<{
        [serial: number]: EmailPreview;
    }>(initialEmailPreviews || {});
    const [currentSettings, setCurrentSettings] = React.useState(initialSettings || []);
    const [hasPendingDeletion, setHasPendingDeletion] = React.useState(false);
    const [activeForm, setActiveForm] = React.useState(0);
    const currentActiveFormData = currentSettings[activeForm];
    const currentActiveFormSerial = currentActiveFormData?.serial;
    const currentActiveFormPreviewData = previewData[currentActiveFormSerial];

    const { register, handleSubmit, control, formState, reset } = useForm();
    const { isDirty } = formState;

    React.useEffect(() => {
        reset({
            serial: currentActiveFormData?.serial,
            to_email: currentActiveFormData?.to_email,
            to_name: currentActiveFormData?.to_name,
            playlist_id: currentActiveFormData?.playlist_id,
            send_test_email: false,
        });
    }, [currentActiveFormData]);

    if (!isLoggedIn) {
        return (
            <div>
                <p>You're not logged in.</p>
                <a href={authUrl} target="_top">
                    Auth with your YouTube Account
                </a>
            </div>
        );
    }

    async function onSubmit(currentFormSettings) {
        setProgressText('Setting up... please wait...');
        const newSettings = currentSettings.map((settings) => ({
            ...settings,
            lastProcessedPublishDate: undefined,
        }));
        newSettings[activeForm] = currentFormSettings;
        try {
            await fetchApi('/api/playlists_setup', {
                data: newSettings,
                statusCodeHandlers: {
                    200: async (res) => {
                        const { updatedSettings, emailPreviews } = await res.json();
                        setPreviewData(emailPreviews);
                        setCurrentSettings(updatedSettings);
                        setProgressText(null);
                        setHasPendingDeletion(false);
                    },
                    400: async (res) => {
                        const { status, message } = await res.json();
                        setProgressText(`${status} ${message.toString()}`);
                    },
                },
            });
        } catch (e) {
            setProgressText('Oops! something went wrong.');
            throw e;
        }
    }

    let previewZoneContent = (
        <p>Save settings and preview the see what the next email will be look like.</p>
    );

    if (currentActiveFormPreviewData) {
        previewZoneContent = (
            <>
                <h2>Your next email will look like this:</h2>
                <p>
                    Subject: <code>{currentActiveFormPreviewData.subject}</code>
                </p>
                <p>
                    From:{' '}
                    <code>{`${currentActiveFormPreviewData.fromName} <${currentActiveFormPreviewData.fromEmail}>`}</code>
                </p>
                <p>
                    To:{' '}
                    <code>{`${currentActiveFormPreviewData.toName} <${currentActiveFormPreviewData.toEmail}>`}</code>
                </p>
                <div
                    dangerouslySetInnerHTML={{
                        __html: currentActiveFormPreviewData.content,
                    }}
                ></div>
            </>
        );
    } else if (currentActiveFormSerial != null) {
        previewZoneContent = <p>No new item in the playlist, nothing to be sent.</p>;
    }
    if (progressText) {
        previewZoneContent = <p>{progressText}</p>;
    }

    return (
        <PageStyle>
            <Head>
                <title>YouTube Friends</title>
            </Head>
            <HeaderStyle>
                {isDirty || currentActiveFormSerial == null || hasPendingDeletion ? (
                    <p
                        style={{
                            color: 'red',
                            flexGrow: 1,
                            flexShrink: 1,
                        }}
                    >
                        <i>You have unsaved change</i>
                    </p>
                ) : null}
                <p>Logged in as: </p>
                <img src={profile.picture} />
                <code>
                    {profile.name} {`<${profile.email}>`}
                </code>
                <button
                    onClick={() => {
                        logout();
                    }}
                >
                    Logout
                </button>
            </HeaderStyle>
            <MainZone>
                <SideBarZone>
                    {currentSettings.map((data, i) => {
                        return (
                            <label key={i}>
                                {i + 1}
                                <input
                                    type="radio"
                                    checked={i === activeForm}
                                    disabled={isDirty || currentActiveFormSerial == null}
                                    onChange={() => setActiveForm(i)}
                                />
                            </label>
                        );
                    })}
                    {currentSettings.length < 3 &&
                    currentActiveFormSerial != null &&
                    !isDirty ? (
                        <button
                            onClick={() => {
                                setActiveForm(currentSettings.length);
                                // @ts-expect-error no harm to initialize as empty, form validation will ensure its content
                                setCurrentSettings([...currentSettings, {}]);
                            }}
                        >
                            Add
                        </button>
                    ) : null}
                    {currentSettings.length > 1 ? (
                        <button
                            onClick={() => {
                                setCurrentSettings(
                                    currentSettings.filter(
                                        (data) => data !== currentActiveFormData,
                                    ),
                                );
                                setActiveForm(Math.max(0, activeForm - 1));
                                if (currentActiveFormSerial != null) {
                                    setHasPendingDeletion(true);
                                }
                            }}
                        >
                            Delete
                        </button>
                    ) : null}
                </SideBarZone>
                <FormZone>
                    <form onSubmit={handleSubmit(onSubmit)}>
                        <h1>
                            {currentActiveFormSerial == null
                                ? 'Create New Subscription'
                                : `Subscription #${currentActiveFormSerial}${
                                      isDirty ? ' (Changed)' : ''
                                  }`}
                        </h1>
                        {/* <input type="hidden" {...register('serial')}></input> */}
                        <label>
                            Recipient name:
                            <input
                                type="text"
                                {...register('to_name', {
                                    required: true,
                                })}
                            ></input>
                        </label>
                        <label>
                            Recipient email:
                            <input
                                type="email"
                                {...register('to_email', {
                                    required: true,
                                })}
                            ></input>
                        </label>
                        {process.env.NODE_ENV !== 'production' && (
                            <label>
                                Send test email:
                                <input type="checkbox" {...register('send_test_email')} />
                            </label>
                        )}
                        <label>Pick a a playlist where emails are sent for:</label>
                        <Controller
                            name="playlist_id"
                            control={control}
                            rules={{ required: true }}
                            render={({ field: { onChange, value, name } }) => (
                                <PlaylistSelect
                                    name={name}
                                    value={value}
                                    onChange={onChange}
                                    playlistsData={playlists}
                                />
                            )}
                        />
                        <FormActions>
                            <button type="submit">Save</button>
                            {process.env.NODE_ENV !== 'production' && (
                                <button
                                    onClick={async () => {
                                        const response = await fetchApi(
                                            '/api/task/schedule',
                                        );
                                        const { schedulerStatus } = await response.json();
                                        window.alert(
                                            JSON.stringify(schedulerStatus, null, 2),
                                        );
                                    }}
                                >
                                    {'DEV ONLY: trigger scheduler / check status'}
                                </button>
                            )}
                        </FormActions>
                    </form>
                </FormZone>
                <PreviewZone>{previewZoneContent}</PreviewZone>
            </MainZone>
        </PageStyle>
    );
}

Page.getInitialProps = async ({ req, res }: NextPageContext) => {
    let isLoggedIn = false;
    let authUrl: string;
    let playlists: youtube_v3.Schema$Playlist[];
    let profile: UserProfile;
    let initialSettings: YouTubeMailSettings[];
    let emailPreviews: {
        [serial: number]: EmailPreview;
    };

    const playlistsDataRes = await fetchApi('/api/playlists_setup', {
        req,
        res,
        statusCodeHandlers: {
            200: async (response) => {
                const data = await response.json();
                debug('data from /api/playlists_setup %O', data);
                isLoggedIn = true;
                playlists = data.playlists;
                profile = data.profile;
                initialSettings = data.settings;
                emailPreviews = data.emailPreviews;
            },
            401: async (response) => {
                authUrl = (await response.json()).authUrl;
            },
        },
    });
    debug(
        'response from /api/playlists_setup %d - %s',
        playlistsDataRes.status,
        playlistsDataRes.statusText,
    );
    return {
        isLoggedIn,
        authUrl,
        playlists,
        profile,
        initialSettings,
        emailPreviews,
    };
};
