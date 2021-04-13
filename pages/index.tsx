import { youtube_v3 } from 'googleapis';
import { fetchApi } from 'lib/client/api';
import { NextPageContext } from 'next';
import styled from 'styled-components';
import React from 'react';
import { useForm, Controller } from 'react-hook-form';
import getDebug from 'debug';
import Head from 'next/head';
import { UserProfile, YouTubeMailSettings } from 'lib/server/google';
const debug = getDebug('YTF:pages/index.tsx');

type Props = {
    isLoggedIn: boolean;
    authUrl: string;
    playlists: youtube_v3.Schema$Playlist[];
    profile: UserProfile;
    existingConfig: YouTubeMailSettings;
};

async function logout(req?, res?) {
    await fetchApi('/api/logout', req, res);
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
    flex-direction: column;
    label {
        display: flex;
        margin: 5px;
    }
    input {
        display: flex;
        margin: 0 5px;
    }
`;

const HeaderStyle = styled.div`
    display: flex;
    justify-content: flex-end;
    align-items: center;
    height: 30px;
    background-color: #eee;

    & > * {
        max-height: 30px;
        margin-right: 10px;
    }
`;

const MainZone = styled.div`
    display: flex;
    width: 100%;
    justify-content: space-between;
`;

const FormZone = styled.div`
    display: flex;
`;

const FormActions = styled.div`
    display: flex;
    margin: 5px;

    & > * {
        margin-right: 5px;
    }
`;

const PreviewZone = styled.div`
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    box-sizing: content-box;
    border: solid 1px black;
    padding: 5px;
    height: calc(100vh - 30px - 10px - 2px);
    width: 700px;
    overflow-x: hidden;
    overflow-y: scroll;
    border-radius: 8px;
`;

export default function Page({
    isLoggedIn,
    authUrl,
    playlists,
    profile,
    existingConfig,
}: Props) {
    const [progressText, setProgressText] = React.useState<string>();
    const [previewData, setPreviewData] = React.useState<{
        emailContent: string;
        subject: string;
        fromName: string;
        fromEmail: string;
        toEmail: string;
        toName: string;
    }>();
    const { register, handleSubmit, control } = useForm();

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

    async function onSubmit(data) {
        window.scrollTo(0, 0);
        setProgressText('Setting up...');
        const res = await fetchApi('/api/playlists_setup', null, null, null, data);
        if (res.status === 200) {
            const { email } = await res.json();
            if (email) {
                setPreviewData(email);
            } else {
                setPreviewData(null);
                setProgressText('No new item in the playlist, nothing to be sent.');
            }
        } else {
            setProgressText(`Oops! something went wrong. (${res.status})`);
        }
    }

    let previewZoneContent = (
        <p>Save settings and preview the see what the next email will be look like.</p>
    );
    if (previewData) {
        previewZoneContent = (
            <>
                <h2>Next Email Preview:</h2>
                <p>
                    Subject: <code>{previewData.subject}</code>
                </p>
                <p>
                    From:{' '}
                    <code>{`${previewData.fromName} <${previewData.fromEmail}>`}</code>
                </p>
                <p>
                    To: <code>{`${previewData.toName} <${previewData.toEmail}>`}</code>
                </p>
                <div dangerouslySetInnerHTML={{ __html: previewData.emailContent }}></div>
            </>
        );
    } else if (progressText) {
        previewZoneContent = <p>{progressText}</p>;
    }

    return (
        <PageStyle>
            <Head>
                <title>YouTube Friends</title>
            </Head>
            <HeaderStyle>
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
                <FormZone>
                    <form onSubmit={handleSubmit(onSubmit)}>
                        <label>
                            Recipient name:
                            <input
                                type="text"
                                defaultValue={existingConfig?.to_name}
                                {...register('to_name', { required: true })}
                            ></input>
                        </label>
                        <label>
                            Recipient email:
                            <input
                                type="email"
                                defaultValue={existingConfig?.to_email}
                                {...register('to_email', { required: true })}
                            ></input>
                        </label>
                        {process.env.NODE_ENV !== 'production' && (
                            <label>
                                Send test email:
                                <input
                                    type="checkbox"
                                    {...register('send_test_email', { required: true })}
                                />
                            </label>
                        )}
                        <label>Pick a a playlist where emails are sent for:</label>
                        <Controller
                            name="playlist_id"
                            control={control}
                            defaultValue={existingConfig?.playlist_id}
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
                            <button type="submit">Save {'&'} Preview</button>
                        </FormActions>
                    </form>
                </FormZone>
                <PreviewZone>{previewZoneContent}</PreviewZone>
            </MainZone>
        </PageStyle>
    );
}

Page.getInitialProps = async ({ req, res }: NextPageContext) => {
    const playlistsDataRes = await fetchApi('/api/playlists_setup', req, res);
    debug(
        'response from /api/playlists_setup %d - %s',
        playlistsDataRes.status,
        playlistsDataRes.statusText,
    );
    let isLoggedIn = false;
    let authUrl: string;
    let playlists: youtube_v3.Schema$Playlist[];
    let profile: UserProfile;
    let existingConfig: YouTubeMailSettings;

    if (playlistsDataRes.status === 401) {
        authUrl = (await playlistsDataRes.json()).authUrl;
    } else if (playlistsDataRes.status == 200) {
        const data = await playlistsDataRes.json();
        debug('data from /api/playlists_setup %O', data);
        isLoggedIn = true;
        playlists = data.playlists;
        profile = data.profile;
        existingConfig = data.config;
    } else {
        await logout(req, res);
    }
    return {
        isLoggedIn,
        authUrl,
        playlists,
        profile,
        existingConfig,
    };
};
